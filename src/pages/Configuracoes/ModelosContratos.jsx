/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Search,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  getTemplate,
  listTemplateSummaries,
  saveTemplate,
} from '../../features/documents/storage/documentStorageAdapter';
import {
  CONTRACT_MODELS,
  validateContractModel,
} from '../../data/contractModels';
import {
  buildContractBlueprint,
  CONTRACT_BLUEPRINT_VERSION,
  upgradeContractTemplateBlueprint,
} from '../../features/documents/editor/contractTemplateBlueprints';
import './ModelosContratos.css';

const OFFICIAL_CATEGORIES = [
  'casamento',
  'ensaio',
  'formatura',
];

const OFFICIAL_NAMES = {
  casamento: 'Contrato de Casamento',
  ensaio: 'Contrato de Ensaio',
  formatura: 'Contrato de Formatura',
};

const upgradingTemplateIds = new Set();

const getCanonicalBaseId = (category) => (
  `contract-${category}`
);

const getTemplateTimestamp = (template = {}) => (
  new Date(
    template.updatedAt
    || template.createdAt
    || 0,
  ).getTime()
);

const compareTemplates = (first, second) => {
  const versionDifference = (
    Number(second.version || 0)
    - Number(first.version || 0)
  );

  if (versionDifference !== 0) {
    return versionDifference;
  }

  if (
    Boolean(second.isLatest)
    !== Boolean(first.isLatest)
  ) {
    return Number(Boolean(second.isLatest))
      - Number(Boolean(first.isLatest));
  }

  return (
    getTemplateTimestamp(second)
    - getTemplateTimestamp(first)
  );
};

const buildDefaultTemplate = (model) => {
  const canonicalId = getCanonicalBaseId(
    model.type,
  );

  return {
    id: canonicalId,
    baseTemplateId: canonicalId,
    documentType: 'contract',
    name:
      OFFICIAL_NAMES[model.type]
      || model.name,
    slug: canonicalId,
    category: model.type,
    version: 1,
    status: 'published',
    isPublished: true,
    isLatest: true,
    pages: buildContractBlueprint(model.type),
    metadata: {
      originalPdf: model.sourceUrl,
      originalPageCount: model.pages,
      blueprintVersion:
        CONTRACT_BLUEPRINT_VERSION,
      generatedInsideEditor: true,
      editableText: true,
      supportsLogo: true,
      createdAt: new Date().toISOString(),
    },
  };
};

export default function ModelosContratos() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');

    try {
      let items = await listTemplateSummaries({
        documentType: 'contract',
      });

      const validModels = CONTRACT_MODELS.filter(
        (model) => (
          OFFICIAL_CATEGORIES.includes(model.type)
          && validateContractModel(model).valid
        ),
      );

      const existingCategories = new Set(
        items
          .filter((item) => (
            OFFICIAL_CATEGORIES.includes(item.category)
          ))
          .map((item) => item.category),
      );

      const missingModels = validModels.filter(
        (model) => !existingCategories.has(model.type),
      );

      if (missingModels.length) {
        await Promise.all(
          missingModels.map((model) => (
            saveTemplate(buildDefaultTemplate(model))
          )),
        );

        items = await listTemplateSummaries(
          { documentType: 'contract' },
          { force: true },
        );
      }

      const officialTemplates = OFFICIAL_CATEGORIES
        .map((category) => (
          items
            .filter((item) => item.category === category)
            .sort(compareTemplates)[0]
        ))
        .filter(Boolean);

      setTemplates(officialTemplates);

      const outdatedTemplates = officialTemplates.filter(
        (item) => (
          Number(item.metadata?.blueprintVersion || 0)
          < CONTRACT_BLUEPRINT_VERSION
          && !upgradingTemplateIds.has(item.id)
        ),
      );

      outdatedTemplates.forEach((item) => {
        upgradingTemplateIds.add(item.id);

        void getTemplate(item.id)
          .then((fullTemplate) => {
            if (
              !fullTemplate
              || Number(fullTemplate.metadata?.blueprintVersion || 0)
                >= CONTRACT_BLUEPRINT_VERSION
            ) {
              return null;
            }

            return saveTemplate(
              upgradeContractTemplateBlueprint(fullTemplate),
            );
          })
          .catch((upgradeError) => {
            console.error(
              `Erro ao atualizar o modelo ${item.category}:`,
              upgradeError,
            );
          })
          .finally(() => {
            upgradingTemplateIds.delete(item.id);
          });
      });
    } catch (caughtError) {
      console.error(
        'Erro ao carregar modelos de contrato:',
        caughtError,
      );

      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível carregar os modelos.',
      );
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const visibleTemplates = useMemo(
    () => templates.filter((template) => {
      const haystack = [
        template.name,
        template.category,
        template.version,
      ].join(' ').toLowerCase();

      return haystack.includes(
        query.trim().toLowerCase(),
      );
    }),
    [query, templates],
  );

  return (
    <section className="contract-model-list">
      <header>
        <div>
          <span>Configurações</span>
          <h1>Modelos de Contratos</h1>
          <p>
            Edite os três modelos oficiais do StudioFlow.
            As versões anteriores permanecem preservadas
            no histórico de cada contrato.
          </p>
        </div>
      </header>

      <div className="contract-model-toolbar">
        <div>
          <Search size={16} />
          <input
            placeholder="Buscar modelos"
            value={query}
            onChange={(event) => {
              setQuery(event.target.value);
            }}
          />
        </div>
      </div>

      {error && (
        <div className="contract-error">
          {error}
        </div>
      )}

      {loading ? (
        <p>Carregando modelos...</p>
      ) : (
        <div className="contract-model-grid">
          {visibleTemplates.map((template) => (
            <article key={template.category}>
              <div className="contract-model-cover">
                <strong>
                  {template.category}
                </strong>

                <span>
                  {template.pageCount || template.metadata?.originalPageCount || 0}
                  {' '}
                  páginas
                </span>
              </div>

              <h2>
                {OFFICIAL_NAMES[template.category]
                  || template.name}
              </h2>

              <div className="contract-model-meta">
                <span>v{template.version}</span>

                <span
                  className={
                    template.isPublished
                      ? 'published'
                      : 'draft'
                  }
                >
                  {template.isPublished
                    ? 'Publicado'
                    : 'Rascunho'}
                </span>
              </div>

              <footer>
                <button
                  type="button"
                  onClick={() => {
                    navigate(
                      `/configuracoes/modelos-contratos/${template.id}`,
                    );
                  }}
                >
                  Editar modelo
                </button>
              </footer>
            </article>
          ))}

          {!visibleTemplates.length && (
            <p className="doc-empty">
              Nenhum modelo encontrado.
            </p>
          )}
        </div>
      )}
    </section>
  );
}