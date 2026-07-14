/* eslint-disable react-hooks/set-state-in-effect */
import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  Copy,
  FilePlus2,
  MoreVertical,
  Search,
  Trash2,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import {
  deleteTemplate,
  listTemplates,
  saveTemplate,
} from '../../features/documents/storage/documentStorageAdapter';
import {
  cloneTemplateVersion,
} from '../../features/documents/services/templateVersionManager';
import {
  createId,
} from '../../features/documents/utils/documentIds';
import {
  CONTRACT_MODELS,
  validateContractModel,
} from '../../data/contractModels';
import {
  buildContractBlueprint,
  CONTRACT_BLUEPRINT_VERSION,
} from '../../features/documents/editor/contractTemplateBlueprints';
import './ModelosContratos.css';

const createBlankPage = () => ({
  id: createId('contract-page'),
  name: 'Página 1',
  order: 0,
  active: true,
  width: 595.28,
  height: 841.89,
  background: {
    type: 'color',
    color: '#fffdf9',
    opacity: 1,
  },
  elements: [],
  metadata: {
    fixedLegalContent: false,
    editableLegalContent: true,
  },
});

const buildDefaultTemplate = (model) => ({
  id: model.id,
  baseTemplateId: model.id,
  documentType: 'contract',
  name: model.name,
  slug: model.id,
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
});

export default function ModelosContratos() {
  const navigate = useNavigate();

  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('todos');
  const [error, setError] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError('');

    try {
      let items = await listTemplates({
        documentType: 'contract',
      });

      const validModels = CONTRACT_MODELS.filter(
        (model) => validateContractModel(model).valid,
      );

      if (!items.length) {
        items = await Promise.all(
          validModels.map((model) => (
            saveTemplate(
              buildDefaultTemplate(model),
            )
          )),
        );
      } else {
        const latestByCategory = new Map(
          items
            .filter((item) => item.isLatest !== false)
            .map((item) => [item.category, item]),
        );

        const missingModels = validModels.filter(
          (model) => !latestByCategory.has(model.type),
        );

        if (missingModels.length) {
          const created = await Promise.all(
            missingModels.map((model) => (
              saveTemplate(
                buildDefaultTemplate(model),
              )
            )),
          );

          items = [...created, ...items];
        }
      }

      const upgradedItems = [];

      for (const item of items) {
        const isOfficialCategory = [
          'casamento',
          'ensaio',
          'formatura',
        ].includes(item.category);

        const currentBlueprintVersion = Number(
          item.metadata?.blueprintVersion || 0,
        );

        if (
          isOfficialCategory
          && currentBlueprintVersion
            < CONTRACT_BLUEPRINT_VERSION
          && item.isLatest !== false
        ) {
          const upgraded = await saveTemplate({
            ...item,
            id: createId('contract-template'),
            baseTemplateId:
              item.baseTemplateId || item.id,
            version:
              Math.max(1, Number(item.version || 1)) + 1,
            status: 'draft',
            isPublished: false,
            isLatest: true,
            pages: buildContractBlueprint(
              item.category,
            ),
            metadata: {
              ...(item.metadata || {}),
              blueprintVersion:
                CONTRACT_BLUEPRINT_VERSION,
              importedFromOfficialPdf: true,
              containsClientPersonalData: false,
              editableText: true,
              supportsLogo: true,
              upgradedAt:
                new Date().toISOString(),
            },
          });

          upgradedItems.push(upgraded);
        }
      }

      if (upgradedItems.length) {
        items = [
          ...upgradedItems,
          ...items.map((item) => (
            upgradedItems.some(
              (upgraded) => (
                upgraded.category === item.category
                && item.isLatest !== false
              ),
            )
              ? {
                  ...item,
                  isLatest: false,
                }
              : item
          )),
        ];
      }

      setTemplates(items);
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

  const createNew = async () => {
    setError('');

    try {
      const saved = await saveTemplate({
        documentType: 'contract',
        name: 'Novo modelo de contrato',
        slug: `contrato-${Date.now()}`,
        category: 'outro',
        version: 1,
        status: 'draft',
        isPublished: false,
        isLatest: true,
        pages: [createBlankPage()],
        metadata: {
          blueprintVersion:
            CONTRACT_BLUEPRINT_VERSION,
          editableText: true,
          supportsLogo: true,
          createdAt: new Date().toISOString(),
        },
      });

      navigate(
        `/configuracoes/modelos-contratos/${saved.id}`,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível criar o modelo.',
      );
    }
  };

  const visibleTemplates = useMemo(
    () => templates
      .filter((template) => (
        template.isLatest !== false
      ))
      .filter((template) => (
        statusFilter === 'todos'
        || (
          statusFilter === 'publicado'
          && template.isPublished
        )
        || (
          statusFilter === 'rascunho'
          && !template.isPublished
        )
      ))
      .filter((template) => {
        const haystack = [
          template.name,
          template.category,
          template.version,
        ].join(' ').toLowerCase();

        return haystack.includes(
          query.toLowerCase(),
        );
      }),
    [
      query,
      statusFilter,
      templates,
    ],
  );

  const duplicateTemplate = async (template) => {
    setError('');

    try {
      await cloneTemplateVersion(template);
      await refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível duplicar o modelo.',
      );
    }
  };

  const removeTemplate = async (template) => {
    if (template.isPublished) {
      alert(
        'Modelos publicados não podem ser excluídos. Crie uma nova versão ou altere o status para rascunho.',
      );
      return;
    }

    if (
      !window.confirm(
        `Excluir o modelo "${template.name}"?`,
      )
    ) {
      return;
    }

    setError('');

    try {
      await deleteTemplate(template.id);
      await refresh();
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Não foi possível excluir o modelo.',
      );
    }
  };

  return (
    <section className="contract-model-list">
      <header>
        <div>
          <span>Configurações</span>
          <h1>Modelos de Contratos</h1>
          <p>
            Gerencie páginas, textos, campos automáticos,
            logomarca e versões publicadas.
          </p>
        </div>

        <button
          type="button"
          onClick={createNew}
        >
          <FilePlus2 />
          Novo modelo de contrato
        </button>
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

        <select
          value={statusFilter}
          onChange={(event) => {
            setStatusFilter(event.target.value);
          }}
        >
          <option value="todos">Todos</option>
          <option value="publicado">Publicados</option>
          <option value="rascunho">Rascunhos</option>
        </select>
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
            <article key={template.id}>
              <div className="contract-model-cover">
                <strong>
                  {template.category || 'outro'}
                </strong>
                <span>
                  {template.pages?.length || 0} páginas
                </span>
              </div>

              <h2>{template.name}</h2>

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

                <details>
                  <summary aria-label="Mais ações">
                    <MoreVertical />
                  </summary>

                  <div>
                    <button
                      type="button"
                      onClick={() => {
                        void duplicateTemplate(template);
                      }}
                    >
                      <Copy />
                      Duplicar
                    </button>

                    <button
                      type="button"
                      onClick={() => {
                        void removeTemplate(template);
                      }}
                    >
                      <Trash2 />
                      Excluir
                    </button>
                  </div>
                </details>
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