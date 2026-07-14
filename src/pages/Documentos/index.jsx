import {
  useEffect,
  useMemo,
  useState,
} from 'react';
import {
  CheckCircle2,
  Copy,
  Download,
  FilePlus2,
  FileSignature,
  Search,
  Trash2,
} from 'lucide-react';
import {
  createId,
  readStorage,
  STORAGE_KEYS,
  writeStorage,
} from '../../utils/storage';
import {
  interpolateTemplate,
  loadSettings,
} from '../../utils/settings';
import ContractWizard from '../../components/ContractWizard';
import {
  contractSummary,
  generateInstallments,
  normalizeContract,
} from '../../utils/contractEngine';
import './Documentos.css';

const EMPTY_DRAFT = {
  type: 'proposta',
  clientId: '',
  projectId: '',
  service: '',
  packageName: '',
  total: '',
  discount: '0',
  validityDays: '15',
  templateId: '',
  deposit: '0',
  installments: '1',
  firstDueDate: '',
  paymentMethod: 'PIX',
};

const DEFAULT_STATUSES = {
  proposta: 'rascunho',
  contrato: 'rascunho',
  recibo: 'gerado',
  autorizacao: 'rascunho',
};

const normalizeNumber = (value) => {
  const text = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const parsed = Number(text);

  return Number.isFinite(parsed)
    ? Math.max(0, parsed)
    : 0;
};

const emitDocumentsUpdate = () => {
  window.dispatchEvent(
    new Event('sf_storage_update'),
  );
};

const buildDocumentSignature = (document = {}) => (
  [
    document.type,
    document.clientId,
    document.projectId,
    document.proposalId,
    document.modelId,
    document.version,
  ].map((value) => String(value || '')).join('|')
);

export default function Documentos() {
  const settings = useMemo(
    () => loadSettings(),
    [],
  );

  const [clients, setClients] = useState(
    () => readStorage(STORAGE_KEYS.clients, []),
  );

  const [projects, setProjects] = useState(
    () => readStorage(STORAGE_KEYS.projects, []),
  );

  const [documents, setDocuments] = useState(
    () => readStorage(STORAGE_KEYS.documents, []),
  );

  const [contracts, setContracts] = useState(
    () => readStorage(STORAGE_KEYS.contracts, [])
      .map(normalizeContract),
  );

  const [draft, setDraft] = useState(EMPTY_DRAFT);
  const [filter, setFilter] = useState('todos');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState(null);
  const [contractProposal, setContractProposal] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    const refresh = () => {
      setClients(
        readStorage(STORAGE_KEYS.clients, []),
      );

      setProjects(
        readStorage(STORAGE_KEYS.projects, []),
      );

      setDocuments(
        readStorage(STORAGE_KEYS.documents, []),
      );

      setContracts(
        readStorage(STORAGE_KEYS.contracts, [])
          .map(normalizeContract),
      );
    };

    window.addEventListener(
      'sf_storage_update',
      refresh,
    );
    window.addEventListener(
      'storage',
      refresh,
    );
    window.addEventListener(
      'focus',
      refresh,
    );

    return () => {
      window.removeEventListener(
        'sf_storage_update',
        refresh,
      );
      window.removeEventListener(
        'storage',
        refresh,
      );
      window.removeEventListener(
        'focus',
        refresh,
      );
    };
  }, []);

  const persistDocuments = (next) => {
    setDocuments(next);
    writeStorage(STORAGE_KEYS.documents, next);
    emitDocumentsUpdate();
  };

  const persistContracts = (next) => {
    const normalized = next.map(normalizeContract);

    setContracts(normalized);
    writeStorage(
      STORAGE_KEYS.contracts,
      normalized,
    );

    const currentProjects = readStorage(
      STORAGE_KEYS.projects,
      [],
    );

    const nextProjects = currentProjects.map((project) => {
      const linked = normalized.filter((item) => (
        String(item.trabalhoId)
        === String(project.id)
      ));

      if (!linked.length) return project;

      const summaries = linked.map(contractSummary);

      const valorContratado = summaries.reduce(
        (sum, item) => sum + item.valorEfetivo,
        0,
      );

      const valorRecebido = summaries.reduce(
        (sum, item) => sum + item.totalRecebido,
        0,
      );

      return {
        ...project,
        valorContratado,
        valor_contratado: valorContratado,
        valorRecebido,
        valor_recebido: valorRecebido,
        saldoPendente:
          valorContratado - valorRecebido,
        saldoRestante:
          valorContratado - valorRecebido,
        contratoIds: linked.map((item) => item.id),
        updatedAt: new Date().toISOString(),
      };
    });

    setProjects(nextProjects);
    writeStorage(
      STORAGE_KEYS.projects,
      nextProjects,
    );

    emitDocumentsUpdate();
  };

  const createDocument = (event) => {
    event.preventDefault();
    setError('');

    const client = clients.find((item) => (
      String(item.id) === String(draft.clientId)
    ));

    if (!client) {
      setError('Selecione um cliente válido.');
      return;
    }

    const totalBeforeDiscount = normalizeNumber(
      draft.total,
    );

    const discount = normalizeNumber(
      draft.discount,
    );

    const total = Math.max(
      0,
      totalBeforeDiscount - discount,
    );

    if (
      ['proposta', 'contrato'].includes(draft.type)
      && total <= 0
    ) {
      setError(
        'Informe um valor maior que zero.',
      );
      return;
    }

    const template = (
      settings.templates.find(
        (item) => item.id === draft.templateId,
      )
      || settings.templates.find(
        (item) => item.type === draft.type,
      )
      || {}
    );

    const values = {
      cliente_nome:
        client.nome
        || client.name
        || 'Cliente',
      cliente_cpf:
        client.cpfCnpj
        || client.cpf_cnpj
        || client.cpf
        || '',
      cliente_email:
        client.email
        || '',
      cliente_endereco:
        client.endereco
        || '',
      servico: draft.service,
      pacote: draft.packageName,
      valor_total: total.toLocaleString(
        'pt-BR',
        {
          style: 'currency',
          currency:
            settings.general.currency
            || 'BRL',
        },
      ),
      entrada: normalizeNumber(
        draft.deposit,
      ).toLocaleString(
        'pt-BR',
        {
          style: 'currency',
          currency:
            settings.general.currency
            || 'BRL',
        },
      ),
      parcelas:
        Number(draft.installments || 1),
      forma_pagamento:
        draft.paymentMethod,
      studio_nome:
        settings.studio.name,
      studio_cnpj:
        settings.studio.document,
      studio_whatsapp:
        settings.studio.whatsapp,
      studio_email:
        settings.studio.email,
      data_atual:
        new Date().toLocaleDateString('pt-BR'),
    };

    const now = new Date().toISOString();

    const document = {
      id: createId('doc'),
      ...draft,
      total,
      discount,
      clientName: values.cliente_nome,
      title:
        template.title
        || template.name
        || draft.type,
      content: interpolateTemplate(
        template.text || '',
        values,
      ),
      clauses: interpolateTemplate(
        template.clauses || '',
        values,
      ),
      status:
        DEFAULT_STATUSES[draft.type],
      createdAt: now,
      updatedAt: now,
      history: [
        {
          status:
            DEFAULT_STATUSES[draft.type],
          at: now,
          action: 'documento_criado',
        },
      ],
    };

    if (draft.type === 'contrato') {
      const duplicate = contracts.find((contract) => (
        String(contract.clienteId)
        === String(draft.clientId)
        && String(contract.trabalhoId || '')
        === String(draft.projectId || '')
        && ['rascunho', 'pendente', 'assinado', 'ativo']
          .includes(contract.status)
      ));

      if (duplicate) {
        setError(
          'Já existe um contrato ativo ou pendente para este cliente e trabalho.',
        );
        return;
      }

      const contractId = createId('contract');

      const contract = {
        id: contractId,
        clienteId: draft.clientId,
        trabalhoId: draft.projectId || '',
        titulo: document.title,
        dataCriacao:
          now.slice(0, 10),
        valorTotal: total,
        valorEntrada:
          normalizeNumber(draft.deposit),
        desconto: discount,
        quantidadeParcelas:
          Math.max(
            1,
            Number(draft.installments || 1),
          ),
        formaPagamentoPadrao:
          draft.paymentMethod,
        status: 'rascunho',
        parcelas: generateInstallments({
          contractId,
          clientId: draft.clientId,
          projectId: draft.projectId || '',
          total,
          deposit: normalizeNumber(draft.deposit),
          count: Math.max(
            1,
            Number(draft.installments || 1),
          ),
          firstDueDate:
            draft.firstDueDate,
          paymentMethod:
            draft.paymentMethod,
        }),
      };

      persistContracts([
        contract,
        ...contracts,
      ]);

      document.contractId = contractId;
    }

    persistDocuments([
      document,
      ...documents,
    ]);

    setSelected(document);
    setDraft(EMPTY_DRAFT);
  };

  const updateStatus = (document, status) => {
    const now = new Date().toISOString();

    const updated = {
      ...document,
      status,
      updatedAt: now,
      history: [
        ...(document.history || []),
        {
          status,
          at: now,
          action: 'status_alterado',
        },
      ],
    };

    persistDocuments(
      documents.map((item) => (
        item.id === document.id
          ? updated
          : item
      )),
    );

    setSelected(updated);
  };

  const approveProposal = (document) => {
    updateStatus(document, 'aprovado');

    if (document.projectId) return;

    const currentProjects = readStorage(
      STORAGE_KEYS.projects,
      [],
    );

    const existingProject = currentProjects.find(
      (project) => (
        String(project.propostaId || '')
        === String(document.id)
      ),
    );

    if (existingProject) return;

    const project = {
      id: createId('project'),
      clienteId: document.clientId,
      clientId: document.clientId,
      clienteNome: document.clientName,
      nome:
        document.service
        || document.packageName,
      tipoServico:
        document.service
        || 'Evento',
      status: 'contrato_fechado',
      valorContratado: document.total,
      valor_contratado: document.total,
      createdAt: new Date().toISOString(),
      propostaId: document.id,
    };

    const nextProjects = [
      ...currentProjects,
      project,
    ];

    setProjects(nextProjects);
    writeStorage(
      STORAGE_KEYS.projects,
      nextProjects,
    );

    const updatedDocument = {
      ...document,
      status: 'aprovado',
      projectId: project.id,
      updatedAt: new Date().toISOString(),
      history: [
        ...(document.history || []),
        {
          status: 'aprovado',
          at: new Date().toISOString(),
          action: 'projeto_criado',
          projectId: project.id,
        },
      ],
    };

    persistDocuments(
      documents.map((item) => (
        item.id === document.id
          ? updatedDocument
          : item
      )),
    );

    setSelected(updatedDocument);
  };

  const saveGeneratedContract = async ({
    model,
    data,
    generated,
  }) => {
    const proposal = contractProposal;

    if (!proposal) {
      throw new Error(
        'A proposta de origem não foi encontrada.',
      );
    }

    const existing = documents.filter((item) => (
      item.type === 'contrato'
      && item.proposalId === proposal.id
    ));

    const version = existing.length + 1;
    const contractId = createId('contract');

    const total = normalizeNumber(
      proposal.total ?? data.total,
    );

    const deposit = normalizeNumber(
      data.deposit,
    );

    const count = Math.max(
      1,
      Math.trunc(
        Number(data.installments || 1),
      ),
    );

    const firstDueDate = String(
      data.dueDates || '',
    ).split(',')[0]?.trim() || '';

    const financial = {
      id: contractId,
      clienteId: proposal.clientId,
      trabalhoId: proposal.projectId || '',
      titulo: model.name,
      dataCriacao:
        new Date().toISOString().slice(0, 10),
      valorTotal: total,
      valorEntrada: deposit,
      quantidadeParcelas: count,
      formaPagamentoPadrao:
        data.paymentMethod || '',
      status: 'pendente',
      parcelas: generateInstallments({
        contractId,
        clientId: proposal.clientId,
        projectId: proposal.projectId || '',
        total,
        deposit,
        count,
        firstDueDate,
        paymentMethod:
          data.paymentMethod || '',
      }),
    };

    const signature = [
      'contrato',
      proposal.clientId,
      proposal.projectId || '',
      proposal.id,
      model.id,
      version,
    ].join('|');

    const duplicateDocument = documents.find(
      (item) => (
        buildDocumentSignature(item) === signature
      ),
    );

    if (duplicateDocument) {
      throw new Error(
        'Esta versão do contrato já foi gerada.',
      );
    }

    const now = new Date().toISOString();

    const document = {
      id: createId('doc'),
      contractId,
      type: 'contrato',
      title: model.name,
      clientId: proposal.clientId,
      clientName: data.clientName,
      projectId: proposal.projectId || '',
      proposalId: proposal.id,
      modelId: model.id,
      modelVersion: model.version,
      version,
      status: 'gerado',
      total,
      variableData: data,
      legalSnapshot:
        generated.originalHashSnapshot,
      pdfFileName:
        generated.fileName,
      createdAt: now,
      generatedAt: now,
      updatedAt: now,
      history: [
        {
          status: 'gerado',
          at: now,
          version,
          action: 'pdf_gerado',
        },
      ],
    };

    persistContracts([
      financial,
      ...contracts,
    ]);

    persistDocuments([
      document,
      ...documents,
    ]);

    setContractProposal(null);
    setSelected(document);

    return document;
  };

  const printDocument = (document) => {
    const popup = window.open(
      '',
      '_blank',
      'width=900,height=700',
    );

    if (!popup) return;

    popup.document.write(`
      <html>
        <head>
          <title>${document.title}</title>
          <style>
            body {
              font: 16px Arial;
              max-width: 780px;
              margin: 50px auto;
              line-height: 1.6;
            }
            h1 { color: #8b642f; }
            .footer { margin-top: 60px; }
          </style>
        </head>
        <body>
          <h1>${document.title}</h1>
          <p>${document.content || ''}</p>
          <h3>Cláusulas</h3>
          <p>${document.clauses || ''}</p>
          <div class="footer">
            ${settings.studio.footer || settings.studio.name}
          </div>
        </body>
      </html>
    `);

    popup.document.close();
    popup.print();
  };

  const deleteDocument = (document) => {
    if (
      document.type === 'contrato'
      && document.contractId
    ) {
      const linkedContract = contracts.find(
        (contract) => (
          contract.id === document.contractId
        ),
      );

      if (
        linkedContract
        && ['assinado', 'ativo', 'concluido']
          .includes(linkedContract.status)
      ) {
        alert(
          'Este contrato não pode ser excluído porque já está assinado, ativo ou concluído.',
        );
        return;
      }
    }

    if (
      !window.confirm(
        `Excluir "${document.title}"?`,
      )
    ) {
      return;
    }

    persistDocuments(
      documents.filter(
        (item) => item.id !== document.id,
      ),
    );

    if (document.contractId) {
      persistContracts(
        contracts.filter(
          (item) => (
            item.id !== document.contractId
          ),
        ),
      );
    }

    setSelected(null);
  };

  const visible = documents.filter((item) => {
    const matchesFilter = (
      filter === 'todos'
      || item.type === filter
    );

    const haystack = [
      item.clientName,
      item.title,
      item.status,
      item.service,
      item.packageName,
    ].join(' ').toLowerCase();

    return (
      matchesFilter
      && haystack.includes(
        query.toLowerCase(),
      )
    );
  });

  return (
    <section className="documents-page">
      <header>
        <div>
          <span>Central operacional</span>
          <h1>Documentos</h1>
          <p>
            Propostas, contratos, recibos e autorizações
            ligados aos seus clientes.
          </p>
        </div>
      </header>

      {error && (
        <div className="contract-error">
          {error}
        </div>
      )}

      <div className="documents-grid">
        <form
          className="document-form"
          onSubmit={createDocument}
        >
          <h2>
            <FilePlus2 size={19} />
            Novo documento
          </h2>

          <label>
            Tipo
            <select
              value={draft.type}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  type: event.target.value,
                  templateId: '',
                }));
              }}
            >
              <option value="proposta">Proposta</option>
              <option value="contrato">Contrato</option>
              <option value="recibo">Recibo</option>
              <option value="autorizacao">Autorização</option>
            </select>
          </label>

          <label>
            Cliente
            <select
              required
              value={draft.clientId}
              onChange={(event) => {
                const clientId = event.target.value;

                setDraft((current) => ({
                  ...current,
                  clientId,
                  projectId: '',
                }));
              }}
            >
              <option value="">Selecione</option>
              {clients.map((client) => (
                <option
                  key={client.id}
                  value={client.id}
                >
                  {client.nome || client.name}
                </option>
              ))}
            </select>
          </label>

          <label>
            Trabalho
            <select
              value={draft.projectId}
              onChange={(event) => {
                const projectId = event.target.value;
                const project = projects.find(
                  (item) => (
                    String(item.id)
                    === String(projectId)
                  ),
                );

                setDraft((current) => ({
                  ...current,
                  projectId,
                  service:
                    current.service
                    || project?.tipoServico
                    || project?.tipo_servico
                    || '',
                  total:
                    current.total
                    || String(
                      project?.valorContratado
                      ?? project?.valor_contratado
                      ?? '',
                    ),
                }));
              }}
            >
              <option value="">Sem trabalho vinculado</option>
              {projects
                .filter((project) => (
                  !draft.clientId
                  || [
                    project.clienteId,
                    project.clientId,
                    project.cliente_id,
                    project.client_id,
                  ].some((id) => (
                    String(id || '')
                    === String(draft.clientId)
                  ))
                ))
                .map((project) => (
                  <option
                    key={project.id}
                    value={project.id}
                  >
                    {project.tipoServico
                      || project.tipo_servico
                      || project.nome
                      || 'Trabalho'}
                  </option>
                ))}
            </select>
          </label>

          <label>
            Serviço
            <input
              required
              value={draft.service}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  service: event.target.value,
                }));
              }}
            />
          </label>

          <label>
            Pacote
            <input
              value={draft.packageName}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  packageName: event.target.value,
                }));
              }}
            />
          </label>

          <div className="doc-row">
            <label>
              Valor
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.total}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    total: event.target.value,
                  }));
                }}
              />
            </label>

            <label>
              Desconto
              <input
                type="number"
                min="0"
                step="0.01"
                value={draft.discount}
                onChange={(event) => {
                  setDraft((current) => ({
                    ...current,
                    discount: event.target.value,
                  }));
                }}
              />
            </label>
          </div>

          {draft.type === 'contrato' && (
            <>
              <div className="doc-row">
                <label>
                  Entrada
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={draft.deposit}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        deposit: event.target.value,
                      }));
                    }}
                  />
                </label>

                <label>
                  Parcelas
                  <input
                    type="number"
                    min="1"
                    step="1"
                    value={draft.installments}
                    onChange={(event) => {
                      setDraft((current) => ({
                        ...current,
                        installments: event.target.value,
                      }));
                    }}
                  />
                </label>
              </div>

              <label>
                Primeiro vencimento
                <input
                  type="date"
                  value={draft.firstDueDate}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      firstDueDate: event.target.value,
                    }));
                  }}
                />
              </label>

              <label>
                Forma de pagamento
                <input
                  value={draft.paymentMethod}
                  onChange={(event) => {
                    setDraft((current) => ({
                      ...current,
                      paymentMethod: event.target.value,
                    }));
                  }}
                />
              </label>
            </>
          )}

          <label>
            Modelo
            <select
              value={draft.templateId}
              onChange={(event) => {
                setDraft((current) => ({
                  ...current,
                  templateId: event.target.value,
                }));
              }}
            >
              <option value="">Modelo padrão</option>
              {settings.templates
                .filter((template) => (
                  template.type === draft.type
                ))
                .map((template) => (
                  <option
                    key={template.id}
                    value={template.id}
                  >
                    {template.name}
                  </option>
                ))}
            </select>
          </label>

          <button type="submit">
            Gerar e pré-visualizar
          </button>
        </form>

        <div className="documents-list">
          <div className="document-toolbar">
            <div>
              <Search size={16} />
              <input
                placeholder="Buscar documentos"
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                }}
              />
            </div>

            <select
              value={filter}
              onChange={(event) => {
                setFilter(event.target.value);
              }}
            >
              <option value="todos">Todos</option>
              <option value="proposta">Propostas</option>
              <option value="contrato">Contratos</option>
              <option value="recibo">Recibos</option>
              <option value="autorizacao">Autorizações</option>
            </select>
          </div>

          {visible.map((document) => (
            <article
              key={document.id}
              onClick={() => {
                setSelected(document);
              }}
            >
              <div>
                <strong>{document.title}</strong>
                <span>
                  {document.clientName}
                  {' · '}
                  {new Date(
                    document.createdAt,
                  ).toLocaleDateString('pt-BR')}
                </span>
              </div>

              <span
                className={`doc-status ${document.status}`}
              >
                {document.status}
              </span>
            </article>
          ))}

          {!visible.length && (
            <p className="doc-empty">
              Nenhum documento encontrado.
            </p>
          )}
        </div>
      </div>

      {selected && (
        <div className="document-preview">
          <header>
            <div>
              <span>{selected.type}</span>
              <h2>{selected.title}</h2>
              <p>{selected.clientName}</p>
            </div>

            <button
              type="button"
              onClick={() => {
                setSelected(null);
              }}
            >
              Fechar
            </button>
          </header>

          <div className="preview-paper">
            <p>
              {selected.content
                || 'Contrato versionado gerado a partir do PDF jurídico original.'}
            </p>

            {selected.clauses && (
              <>
                <h3>Cláusulas</h3>
                <p>{selected.clauses}</p>
              </>
            )}
          </div>

          <footer>
            {selected.type !== 'contrato' && (
              <button
                type="button"
                onClick={() => {
                  printDocument(selected);
                }}
              >
                <Download />
                Baixar / Imprimir PDF
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                const duplicated = {
                  ...selected,
                  id: createId('doc'),
                  status: 'rascunho',
                  createdAt:
                    new Date().toISOString(),
                  updatedAt:
                    new Date().toISOString(),
                  history: [
                    ...(selected.history || []),
                    {
                      status: 'rascunho',
                      at: new Date().toISOString(),
                      action: 'documento_duplicado',
                    },
                  ],
                };

                persistDocuments([
                  duplicated,
                  ...documents,
                ]);
              }}
            >
              <Copy />
              Duplicar
            </button>

            {selected.type === 'proposta'
              && selected.status !== 'aprovado'
              && (
                <button
                  type="button"
                  onClick={() => {
                    approveProposal(selected);
                  }}
                >
                  <CheckCircle2 />
                  Aprovar proposta
                </button>
              )}

            {selected.type === 'proposta'
              && selected.status === 'aprovado'
              && (
                <button
                  type="button"
                  onClick={() => {
                    setContractProposal(selected);
                  }}
                >
                  <FileSignature />
                  Gerar contrato
                </button>
              )}

            <button
              type="button"
              className="danger"
              onClick={() => {
                deleteDocument(selected);
              }}
            >
              <Trash2 />
              Excluir
            </button>
          </footer>
        </div>
      )}

      {contractProposal && (
        <ContractWizard
          proposal={contractProposal}
          client={clients.find((client) => (
            String(client.id)
            === String(contractProposal.clientId)
          ))}
          project={projects.find((project) => (
            String(project.id)
            === String(contractProposal.projectId)
          ))}
          studio={settings.studio}
          onClose={() => {
            setContractProposal(null);
          }}
          onSave={saveGeneratedContract}
        />
      )}
    </section>
  );
}