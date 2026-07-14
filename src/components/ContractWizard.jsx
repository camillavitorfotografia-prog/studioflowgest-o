import { useMemo, useState } from 'react';
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  FileCheck2,
  X,
} from 'lucide-react';
import {
  CONTRACT_MODELS,
  suggestContractModel,
} from '../data/contractModels';
import {
  downloadPdf,
  generateContractPdf,
} from '../utils/contractPdf';
import {
  capitalizeName,
  maskCurrency,
  maskDate,
  maskPhone,
} from '../utils/masks';
import './ContractWizard.css';

const STEPS = [
  'Modelo',
  'Contratante',
  'Evento',
  'Cobertura',
  'Entregas',
  'Logística',
  'Pagamento',
  'Assinatura',
  'Revisão',
  'PDF',
];

const COVERAGE_OPTIONS = [
  'Fotografia',
  'Filmagem',
  'Fotografia e filmagem',
  'Não incluso',
];

const YES_NO_OPTIONS = [
  'Sim',
  'Não',
  'A definir',
];

const SIGNATURE_STATUS_OPTIONS = [
  'Pendente',
  'Enviado para assinatura digital',
  'Assinado digitalmente',
  'Assinado presencialmente',
];

const SIGNATURE_METHOD_OPTIONS = [
  'Assinatura digital',
  'Assinatura presencial',
  'Assinatura eletrônica por plataforma',
  'A definir',
];

const CEREMONY_TYPE_OPTIONS = [
  'Religiosa',
  'Civil',
  'Simbólica',
  'Na praia',
  'Outro',
];

const PAYMENT_METHOD_OPTIONS = [
  'Pix',
  'Transferência bancária',
  'Cartão de crédito',
  'Cartão de débito',
  'Dinheiro',
  'Boleto',
  'Outro',
];

const normalizeNumber = (value) => {
  const text = String(value ?? '')
    .replace(/[^\d,.-]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');

  const number = Number(text);

  return Number.isFinite(number) ? number : 0;
};

const normalizeDateToInput = (value = '') => {
  const text = String(value || '').trim();

  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
    return text;
  }

  if (/^\d{2}\/\d{2}\/\d{4}$/.test(text)) {
    const [day, month, year] = text.split('/');
    return `${year}-${month}-${day}`;
  }

  return '';
};

const formatDateForDisplay = (value = '') => {
  const inputValue = normalizeDateToInput(value);

  if (!inputValue) return '';

  const [year, month, day] = inputValue.split('-');

  return `${day}/${month}/${year}`;
};

const maskCpfCnpj = (value = '') => {
  const numbers = String(value || '')
    .replace(/\D/g, '')
    .slice(0, 14);

  if (numbers.length <= 11) {
    return numbers
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d)/, '$1.$2')
      .replace(/(\d{3})(\d{1,2})$/, '$1-$2');
  }

  return numbers
    .replace(/(\d{2})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1/$2')
    .replace(/(\d{4})(\d{1,2})$/, '$1-$2');
};

const maskRg = (value = '') => (
  String(value || '')
    .replace(/[^0-9A-Za-z.-]/g, '')
    .slice(0, 20)
);

const buildInitialData = ({
  proposal = {},
  client = {},
  project = {},
  studio = {},
}) => {
  const total = normalizeNumber(
    proposal.total
    ?? project.valorContratado
    ?? project.valor_contratado
    ?? 0,
  );

  const deposit = normalizeNumber(
    proposal.deposit
    ?? project.valorEntrada
    ?? 0,
  );

  return {
    clientName:
      client.nome
      || proposal.clientName
      || '',
    clientDocument:
      client.cpfCnpj
      || client.cpf_cnpj
      || client.cpf
      || client.cnpj
      || '',
    clientRg: client.rg || '',
    clientEmail: client.email || '',
    clientPhone:
      client.telefone
      || client.whatsapp
      || '',
    clientAddress:
      client.endereco
      || '',
    clientCity:
      client.cidade
      || '',
    clientState:
      client.estado
      || '',
    clientZipCode:
      client.cep
      || '',
    service:
      proposal.service
      || project.tipoServico
      || project.tipo_servico
      || '',
    eventDate:
      normalizeDateToInput(
        project.data
        || project.dataTrabalho
        || project.data_trabalho
        || '',
      ),
    startTime:
      project.horario
      || project.startTime
      || '',
    endTime:
      project.horarioFinal
      || project.endTime
      || '',
    eventLocation:
      project.local
      || client.cidade
      || '',
    eventCity:
      project.cidade
      || client.cidade
      || '',
    eventNotes: '',
    ceremonyType: '',
    ceremonyLocation: '',
    ceremonyTime: '',
    receptionIncluded: 'A definir',
    receptionLocation: '',
    receptionTime: '',
    makingOfBride: 'A definir',
    makingOfGroom: 'A definir',
    preWeddingIncluded: 'A definir',
    preWeddingLocation: '',
    coverageType: 'Fotografia e filmagem',
    coverageDuration: '',
    coverageStart: '',
    coverageEnd: '',
    teamDescription: '',
    packageName:
      proposal.packageName
      || '',
    services:
      proposal.services
      || '',
    deliveryDeadline: '',
    photoQuantity: '',
    filmDuration: '',
    galleryIncluded: 'Sim',
    albumIncluded: 'Não',
    albumDescription: '',
    extraPhotoValue: '',
    extraHourValue: '',
    travelIncluded: 'Não',
    travelValue: '',
    accommodationIncluded: 'Não',
    accommodationResponsibility: '',
    mealsIncluded: 'Não',
    mealsResponsibility: '',
    parkingIncluded: 'Não',
    logisticsNotes: '',
    total:
      total
        ? maskCurrency(
            String(Math.round(total * 100)),
          )
        : '',
    deposit:
      deposit
        ? maskCurrency(
            String(Math.round(deposit * 100)),
          )
        : '',
    balance:
      total
        ? maskCurrency(
            String(
              Math.round(
                Math.max(0, total - deposit) * 100,
              ),
            ),
          )
        : '',
    paymentMethod:
      proposal.paymentMethod
      || 'Pix',
    installments:
      String(proposal.installments || 1),
    firstDueDate:
      normalizeDateToInput(
        proposal.firstDueDate
        || '',
      ),
    paymentConditions: '',
    lateFeePercent: '2',
    monthlyInterestPercent: '1',
    studioName:
      studio.name
      || '',
    studioDocument:
      studio.document
      || '',
    studioPix:
      studio.pix
      || '',
    signatureCity:
      client.cidade
      || '',
    signatureDate:
      new Date().toISOString().slice(0, 10),
    signatureMethod:
      'Assinatura digital',
    signatureStatus:
      'Pendente',
    studioRepresentative:
      studio.representative
      || studio.owner
      || 'Camilla Vitor',
    clientSigner:
      client.nome
      || proposal.clientName
      || '',
    witness1: '',
    witness2: '',
    specific: {},
  };
};

const validateStep = ({
  step,
  data,
  model,
}) => {
  const errors = [];

  if (step === 0 && !model?.id) {
    errors.push('Selecione um modelo de contrato.');
  }

  if (step === 1) {
    if (!String(data.clientName || '').trim()) {
      errors.push('Informe o nome completo do contratante.');
    }

    if (!String(data.clientDocument || '').trim()) {
      errors.push('Informe o CPF ou CNPJ do contratante.');
    }

    if (!String(data.clientPhone || '').trim()) {
      errors.push('Informe o telefone do contratante.');
    }
  }

  if (step === 2) {
    if (!String(data.service || '').trim()) {
      errors.push('Informe o tipo de serviço.');
    }

    if (!normalizeDateToInput(data.eventDate)) {
      errors.push('Informe uma data válida para o evento.');
    }

    if (!String(data.eventLocation || '').trim()) {
      errors.push('Informe o local principal do evento.');
    }
  }

  if (step === 3) {
    if (!String(data.coverageType || '').trim()) {
      errors.push('Selecione o tipo de cobertura.');
    }

    if (!String(data.coverageDuration || '').trim()) {
      errors.push('Informe a duração da cobertura.');
    }
  }

  if (step === 4) {
    if (!String(data.packageName || '').trim()) {
      errors.push('Informe o pacote contratado.');
    }

    if (!String(data.deliveryDeadline || '').trim()) {
      errors.push('Informe o prazo de entrega.');
    }
  }

  if (step === 6) {
    const total = normalizeNumber(data.total);
    const deposit = normalizeNumber(data.deposit);
    const installments = Math.max(
      1,
      Number(data.installments || 1),
    );

    if (total <= 0) {
      errors.push('Informe um valor total maior que zero.');
    }

    if (deposit < 0 || deposit > total) {
      errors.push(
        'A entrada deve estar entre zero e o valor total.',
      );
    }

    if (!Number.isInteger(installments)) {
      errors.push(
        'A quantidade de parcelas deve ser um número inteiro.',
      );
    }

    if (
      installments > 1
      && !normalizeDateToInput(data.firstDueDate)
    ) {
      errors.push(
        'Informe a data do primeiro vencimento.',
      );
    }
  }

  if (step === 7) {
    if (!String(data.signatureCity || '').trim()) {
      errors.push('Informe a cidade da assinatura.');
    }

    if (!normalizeDateToInput(data.signatureDate)) {
      errors.push('Informe a data da assinatura.');
    }

    if (!String(data.clientSigner || '').trim()) {
      errors.push(
        'Informe o nome de quem assinará pelo cliente.',
      );
    }

    if (!String(data.studioRepresentative || '').trim()) {
      errors.push(
        'Informe o responsável que assinará pelo estúdio.',
      );
    }
  }

  return errors;
};

const SummaryRow = ({
  label,
  value,
}) => (
  <div className="contract-review-row">
    <span>{label}</span>
    <strong>{value || 'Não informado'}</strong>
  </div>
);

const FieldGroup = ({
  title,
  description,
  children,
}) => (
  <section className="contract-guided-group">
    <header>
      <h3>{title}</h3>
      {description && <p>{description}</p>}
    </header>
    <div className="contract-fields">
      {children}
    </div>
  </section>
);

const TextField = ({
  label,
  value,
  onChange,
  placeholder = '',
  type = 'text',
  readOnly = false,
}) => (
  <label>
    <span>{label}</span>
    <input
      type={type}
      value={value ?? ''}
      placeholder={placeholder}
      readOnly={readOnly}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  </label>
);

const SelectField = ({
  label,
  value,
  onChange,
  options = [],
}) => (
  <label>
    <span>{label}</span>
    <select
      value={value ?? ''}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    >
      <option value="">Selecione</option>
      {options.map((option) => (
        <option
          key={option}
          value={option}
        >
          {option}
        </option>
      ))}
    </select>
  </label>
);

const TextAreaField = ({
  label,
  value,
  onChange,
  placeholder = '',
}) => (
  <label>
    <span>{label}</span>
    <textarea
      value={value ?? ''}
      placeholder={placeholder}
      onChange={(event) => {
        onChange(event.target.value);
      }}
    />
  </label>
);

export default function ContractWizard({
  proposal = {},
  client = {},
  project = {},
  studio = {},
  onClose,
  onSave,
  initialModelId,
}) {
  const suggested = useMemo(
    () => suggestContractModel(
      proposal.service
      || project?.tipoServico
      || project?.tipo_servico
      || '',
    ),
    [
      project?.tipoServico,
      project?.tipo_servico,
      proposal.service,
    ],
  );

  const [step, setStep] = useState(
    initialModelId ? 1 : 0,
  );
  const [modelId, setModelId] = useState(
    initialModelId || suggested.id,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [data, setData] = useState(() => (
    buildInitialData({
      proposal,
      client,
      project,
      studio,
    })
  ));

  const model = (
    CONTRACT_MODELS.find(
      (item) => item.id === modelId,
    )
    || suggested
    || CONTRACT_MODELS[0]
  );

  const update = (key, value) => {
    setError('');

    setData((current) => {
      const next = {
        ...current,
        [key]: value,
      };

      if (
        key === 'total'
        || key === 'deposit'
      ) {
        const total = normalizeNumber(
          key === 'total'
            ? value
            : current.total,
        );

        const deposit = normalizeNumber(
          key === 'deposit'
            ? value
            : current.deposit,
        );

        next.balance = maskCurrency(
          String(
            Math.round(
              Math.max(0, total - deposit) * 100,
            ),
          ),
        );
      }

      return next;
    });
  };

  const goNext = () => {
    const errors = validateStep({
      step,
      data,
      model,
    });

    if (errors.length) {
      setError(errors.join(' '));
      return;
    }

    setError('');
    setStep((current) => (
      Math.min(STEPS.length - 1, current + 1)
    ));
  };

  const goBack = () => {
    setError('');
    setStep((current) => (
      Math.max(0, current - 1)
    ));
  };

  const finish = async () => {
    const errors = validateStep({
      step: 7,
      data,
      model,
    });

    if (errors.length) {
      setError(errors.join(' '));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const normalizedData = {
        ...data,
        clientName: capitalizeName(data.clientName),
        clientDocument: maskCpfCnpj(
          data.clientDocument,
        ),
        clientPhone: maskPhone(
          data.clientPhone,
        ),
        eventDate:
          normalizeDateToInput(data.eventDate),
        signatureDate:
          normalizeDateToInput(data.signatureDate),
        firstDueDate:
          normalizeDateToInput(data.firstDueDate),
        total:
          normalizeNumber(data.total),
        deposit:
          normalizeNumber(data.deposit),
        balance:
          Math.max(
            0,
            normalizeNumber(data.total)
            - normalizeNumber(data.deposit),
          ),
        installments:
          Math.max(
            1,
            Math.trunc(
              Number(data.installments || 1),
            ),
          ),
      };

      const generated = await generateContractPdf({
        model,
        contract: normalizedData,
      });

      await onSave({
        model,
        data: normalizedData,
        generated,
      });

      downloadPdf(
        generated.bytes,
        generated.fileName,
      );
    } catch (caughtError) {
      setError(
        caughtError instanceof Error
          ? caughtError.message
          : 'Falha ao gerar contrato.',
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="contract-overlay"
      role="dialog"
      aria-modal="true"
      aria-label="Assistente de contrato"
    >
      <section className="contract-wizard">
        <header>
          <div>
            <span>Assistente de contrato</span>
            <h2>{model.name}</h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
          >
            <X />
          </button>
        </header>

        <ol className="contract-progress">
          {STEPS.map((label, index) => (
            <li
              key={label}
              className={
                index === step
                  ? 'active'
                  : index < step
                    ? 'done'
                    : ''
              }
            >
              <span>{index + 1}</span>
              <small>{label}</small>
            </li>
          ))}
        </ol>

        <main>
          {error && (
            <div
              className="contract-error"
              role="alert"
            >
              {error}
            </div>
          )}

          {step === 0 && (
            <div className="contract-models">
              {CONTRACT_MODELS.map((item) => (
                <button
                  type="button"
                  key={item.id}
                  className={
                    modelId === item.id
                      ? 'selected'
                      : ''
                  }
                  onClick={() => {
                    setModelId(item.id);
                    setError('');
                  }}
                >
                  <div className="contract-cover">
                    <FileCheck2 />
                  </div>
                  <strong>{item.name}</strong>
                  <span>
                    Versão {item.version}
                    {' · '}
                    {item.pages} páginas
                  </span>
                  <span>
                    {item.description}
                  </span>
                </button>
              ))}
            </div>
          )}

          {step === 1 && (
            <>
              <FieldGroup
                title="Dados do contratante"
                description="Essas informações serão usadas na identificação jurídica do cliente no contrato."
              >
                <TextField
                  label="Nome completo"
                  value={data.clientName}
                  onChange={(value) => {
                    update(
                      'clientName',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Nome completo do contratante"
                />

                <TextField
                  label="CPF ou CNPJ"
                  value={data.clientDocument}
                  onChange={(value) => {
                    update(
                      'clientDocument',
                      maskCpfCnpj(value),
                    );
                  }}
                  placeholder="000.000.000-00"
                />

                <TextField
                  label="RG"
                  value={data.clientRg}
                  onChange={(value) => {
                    update('clientRg', maskRg(value));
                  }}
                  placeholder="Número do RG"
                />

                <TextField
                  label="E-mail"
                  type="email"
                  value={data.clientEmail}
                  onChange={(value) => {
                    update('clientEmail', value);
                  }}
                  placeholder="cliente@email.com"
                />

                <TextField
                  label="Telefone"
                  value={data.clientPhone}
                  onChange={(value) => {
                    update(
                      'clientPhone',
                      maskPhone(value),
                    );
                  }}
                  placeholder="(00) 9 0000-0000"
                />
              </FieldGroup>

              <FieldGroup
                title="Endereço do contratante"
                description="Preencha o endereço que deverá constar na qualificação do contrato."
              >
                <TextField
                  label="Endereço completo"
                  value={data.clientAddress}
                  onChange={(value) => {
                    update('clientAddress', value);
                  }}
                  placeholder="Rua, número e complemento"
                />

                <TextField
                  label="Cidade"
                  value={data.clientCity}
                  onChange={(value) => {
                    update(
                      'clientCity',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Estado"
                  value={data.clientState}
                  onChange={(value) => {
                    update(
                      'clientState',
                      value.toUpperCase().slice(0, 2),
                    );
                  }}
                  placeholder="BA"
                />

                <TextField
                  label="CEP"
                  value={data.clientZipCode}
                  onChange={(value) => {
                    update(
                      'clientZipCode',
                      String(value)
                        .replace(/\D/g, '')
                        .replace(
                          /(\d{5})(\d{1,3})/,
                          '$1-$2',
                        )
                        .slice(0, 9),
                    );
                  }}
                  placeholder="00000-000"
                />
              </FieldGroup>
            </>
          )}

          {step === 2 && (
            <>
              <FieldGroup
                title="Informações principais do evento"
                description="Esses dados definem quando e onde o serviço será realizado."
              >
                <TextField
                  label="Tipo de serviço"
                  value={data.service}
                  onChange={(value) => {
                    update(
                      'service',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Ex.: Casamento"
                />

                <TextField
                  label="Data do evento"
                  type="date"
                  value={data.eventDate}
                  onChange={(value) => {
                    update('eventDate', value);
                  }}
                />

                <TextField
                  label="Horário inicial"
                  type="time"
                  value={data.startTime}
                  onChange={(value) => {
                    update('startTime', value);
                  }}
                />

                <TextField
                  label="Horário final"
                  type="time"
                  value={data.endTime}
                  onChange={(value) => {
                    update('endTime', value);
                  }}
                />

                <TextField
                  label="Local principal"
                  value={data.eventLocation}
                  onChange={(value) => {
                    update(
                      'eventLocation',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Nome do espaço ou endereço"
                />

                <TextField
                  label="Cidade do evento"
                  value={data.eventCity}
                  onChange={(value) => {
                    update(
                      'eventCity',
                      capitalizeName(value),
                    );
                  }}
                />
              </FieldGroup>

              <FieldGroup
                title="Cerimônia e recepção"
                description="Informe como será cada parte do evento."
              >
                <SelectField
                  label="Tipo de cerimônia"
                  value={data.ceremonyType}
                  onChange={(value) => {
                    update('ceremonyType', value);
                  }}
                  options={CEREMONY_TYPE_OPTIONS}
                />

                <TextField
                  label="Local da cerimônia"
                  value={data.ceremonyLocation}
                  onChange={(value) => {
                    update(
                      'ceremonyLocation',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Horário da cerimônia"
                  type="time"
                  value={data.ceremonyTime}
                  onChange={(value) => {
                    update('ceremonyTime', value);
                  }}
                />

                <SelectField
                  label="Recepção incluída"
                  value={data.receptionIncluded}
                  onChange={(value) => {
                    update(
                      'receptionIncluded',
                      value,
                    );
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextField
                  label="Local da recepção"
                  value={data.receptionLocation}
                  onChange={(value) => {
                    update(
                      'receptionLocation',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Horário da recepção"
                  type="time"
                  value={data.receptionTime}
                  onChange={(value) => {
                    update('receptionTime', value);
                  }}
                />
              </FieldGroup>

              <TextAreaField
                label="Observações do evento"
                value={data.eventNotes}
                onChange={(value) => {
                  update('eventNotes', value);
                }}
                placeholder="Informações importantes sobre o local, acesso, cronograma ou restrições."
              />
            </>
          )}

          {step === 3 && (
            <>
              <FieldGroup
                title="Cobertura contratada"
                description="Defina exatamente quais momentos e serviços estarão incluídos."
              >
                <SelectField
                  label="Tipo de cobertura"
                  value={data.coverageType}
                  onChange={(value) => {
                    update('coverageType', value);
                  }}
                  options={COVERAGE_OPTIONS}
                />

                <TextField
                  label="Duração total"
                  value={data.coverageDuration}
                  onChange={(value) => {
                    update('coverageDuration', value);
                  }}
                  placeholder="Ex.: 8 horas"
                />

                <TextField
                  label="Início da cobertura"
                  type="time"
                  value={data.coverageStart}
                  onChange={(value) => {
                    update('coverageStart', value);
                  }}
                />

                <TextField
                  label="Fim da cobertura"
                  type="time"
                  value={data.coverageEnd}
                  onChange={(value) => {
                    update('coverageEnd', value);
                  }}
                />

                <SelectField
                  label="Making of da noiva"
                  value={data.makingOfBride}
                  onChange={(value) => {
                    update('makingOfBride', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <SelectField
                  label="Making of do noivo"
                  value={data.makingOfGroom}
                  onChange={(value) => {
                    update('makingOfGroom', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <SelectField
                  label="Pré-wedding incluído"
                  value={data.preWeddingIncluded}
                  onChange={(value) => {
                    update(
                      'preWeddingIncluded',
                      value,
                    );
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextField
                  label="Local do pré-wedding"
                  value={data.preWeddingLocation}
                  onChange={(value) => {
                    update(
                      'preWeddingLocation',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Preencher quando estiver incluído"
                />

                <TextField
                  label="Equipe responsável"
                  value={data.teamDescription}
                  onChange={(value) => {
                    update(
                      'teamDescription',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Ex.: Camilla e Junior"
                />
              </FieldGroup>
            </>
          )}

          {step === 4 && (
            <>
              <FieldGroup
                title="Pacote e entregas"
                description="Defina o que o cliente receberá e em qual prazo."
              >
                <TextField
                  label="Nome do pacote"
                  value={data.packageName}
                  onChange={(value) => {
                    update(
                      'packageName',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Ex.: Pacote Completo"
                />

                <TextAreaField
                  label="Serviços e itens incluídos"
                  value={data.services}
                  onChange={(value) => {
                    update('services', value);
                  }}
                  placeholder="Ex.: fotografia, filme, making of, cerimônia, recepção e pré-wedding."
                />

                <TextField
                  label="Prazo de entrega"
                  value={data.deliveryDeadline}
                  onChange={(value) => {
                    update(
                      'deliveryDeadline',
                      value,
                    );
                  }}
                  placeholder="Ex.: até 60 dias após o evento"
                />

                <TextField
                  label="Quantidade estimada de fotos"
                  value={data.photoQuantity}
                  onChange={(value) => {
                    update(
                      'photoQuantity',
                      value.replace(/\D/g, ''),
                    );
                  }}
                  placeholder="Ex.: 800"
                />

                <TextField
                  label="Duração estimada do filme"
                  value={data.filmDuration}
                  onChange={(value) => {
                    update('filmDuration', value);
                  }}
                  placeholder="Ex.: até 8 minutos"
                />

                <SelectField
                  label="Galeria online incluída"
                  value={data.galleryIncluded}
                  onChange={(value) => {
                    update('galleryIncluded', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <SelectField
                  label="Álbum incluído"
                  value={data.albumIncluded}
                  onChange={(value) => {
                    update('albumIncluded', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextAreaField
                  label="Detalhes do álbum ou impressos"
                  value={data.albumDescription}
                  onChange={(value) => {
                    update(
                      'albumDescription',
                      value,
                    );
                  }}
                  placeholder="Descreva formato, quantidade de páginas, tamanho ou deixe como não incluso."
                />

                <TextField
                  label="Valor de foto extra"
                  value={data.extraPhotoValue}
                  onChange={(value) => {
                    update(
                      'extraPhotoValue',
                      maskCurrency(value),
                    );
                  }}
                  placeholder="R$ 0,00"
                />

                <TextField
                  label="Valor da hora extra"
                  value={data.extraHourValue}
                  onChange={(value) => {
                    update(
                      'extraHourValue',
                      maskCurrency(value),
                    );
                  }}
                  placeholder="R$ 0,00"
                />
              </FieldGroup>
            </>
          )}

          {step === 5 && (
            <>
              <FieldGroup
                title="Deslocamento"
                description="Defina quem será responsável pelos custos de transporte e acesso ao local."
              >
                <SelectField
                  label="Deslocamento incluído"
                  value={data.travelIncluded}
                  onChange={(value) => {
                    update('travelIncluded', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextField
                  label="Valor do deslocamento"
                  value={data.travelValue}
                  onChange={(value) => {
                    update(
                      'travelValue',
                      maskCurrency(value),
                    );
                  }}
                  placeholder="R$ 0,00"
                />

                <SelectField
                  label="Estacionamento incluído"
                  value={data.parkingIncluded}
                  onChange={(value) => {
                    update('parkingIncluded', value);
                  }}
                  options={YES_NO_OPTIONS}
                />
              </FieldGroup>

              <FieldGroup
                title="Hospedagem e alimentação"
                description="Preencha quando o trabalho exigir viagem, pernoite ou permanência prolongada."
              >
                <SelectField
                  label="Hospedagem necessária"
                  value={data.accommodationIncluded}
                  onChange={(value) => {
                    update(
                      'accommodationIncluded',
                      value,
                    );
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextField
                  label="Responsável pela hospedagem"
                  value={data.accommodationResponsibility}
                  onChange={(value) => {
                    update(
                      'accommodationResponsibility',
                      value,
                    );
                  }}
                  placeholder="Ex.: contratante, estúdio ou não se aplica"
                />

                <SelectField
                  label="Alimentação necessária"
                  value={data.mealsIncluded}
                  onChange={(value) => {
                    update('mealsIncluded', value);
                  }}
                  options={YES_NO_OPTIONS}
                />

                <TextField
                  label="Responsável pela alimentação"
                  value={data.mealsResponsibility}
                  onChange={(value) => {
                    update(
                      'mealsResponsibility',
                      value,
                    );
                  }}
                  placeholder="Ex.: contratante, estúdio ou não se aplica"
                />

                <TextAreaField
                  label="Observações de logística"
                  value={data.logisticsNotes}
                  onChange={(value) => {
                    update('logisticsNotes', value);
                  }}
                  placeholder="Acesso ao local, balsa, pedágio, estacionamento, hospedagem ou horários especiais."
                />
              </FieldGroup>
            </>
          )}

          {step === 6 && (
            <>
              <FieldGroup
                title="Valores"
                description="Os valores serão incluídos automaticamente nas cláusulas financeiras."
              >
                <TextField
                  label="Valor total"
                  value={data.total}
                  onChange={(value) => {
                    update(
                      'total',
                      maskCurrency(value),
                    );
                  }}
                  placeholder="R$ 0,00"
                />

                <TextField
                  label="Entrada"
                  value={data.deposit}
                  onChange={(value) => {
                    update(
                      'deposit',
                      maskCurrency(value),
                    );
                  }}
                  placeholder="R$ 0,00"
                />

                <TextField
                  label="Saldo restante"
                  value={data.balance}
                  onChange={() => {}}
                  readOnly
                />

                <SelectField
                  label="Forma de pagamento"
                  value={data.paymentMethod}
                  onChange={(value) => {
                    update('paymentMethod', value);
                  }}
                  options={PAYMENT_METHOD_OPTIONS}
                />

                <TextField
                  label="Quantidade de parcelas"
                  type="number"
                  value={data.installments}
                  onChange={(value) => {
                    update(
                      'installments',
                      String(
                        Math.max(
                          1,
                          Math.trunc(
                            Number(value || 1),
                          ),
                        ),
                      ),
                    );
                  }}
                />

                <TextField
                  label="Primeiro vencimento"
                  type="date"
                  value={data.firstDueDate}
                  onChange={(value) => {
                    update('firstDueDate', value);
                  }}
                />
              </FieldGroup>

              <FieldGroup
                title="Condições financeiras"
                description="Defina regras de vencimento, atraso e observações específicas."
              >
                <TextAreaField
                  label="Condições de pagamento"
                  value={data.paymentConditions}
                  onChange={(value) => {
                    update(
                      'paymentConditions',
                      value,
                    );
                  }}
                  placeholder="Ex.: 30% na assinatura, 50% até 60 dias antes e 20% no mês do evento."
                />

                <TextField
                  label="Multa por atraso (%)"
                  type="number"
                  value={data.lateFeePercent}
                  onChange={(value) => {
                    update(
                      'lateFeePercent',
                      value,
                    );
                  }}
                />

                <TextField
                  label="Juros mensais (%)"
                  type="number"
                  value={data.monthlyInterestPercent}
                  onChange={(value) => {
                    update(
                      'monthlyInterestPercent',
                      value,
                    );
                  }}
                />
              </FieldGroup>
            </>
          )}

          {step === 7 && (
            <>
              <FieldGroup
                title="Dados da assinatura"
                description="Essas informações identificam quem assinará e como o contrato será formalizado."
              >
                <TextField
                  label="Cidade da assinatura"
                  value={data.signatureCity}
                  onChange={(value) => {
                    update(
                      'signatureCity',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Data da assinatura"
                  type="date"
                  value={data.signatureDate}
                  onChange={(value) => {
                    update('signatureDate', value);
                  }}
                />

                <SelectField
                  label="Forma de assinatura"
                  value={data.signatureMethod}
                  onChange={(value) => {
                    update('signatureMethod', value);
                  }}
                  options={SIGNATURE_METHOD_OPTIONS}
                />

                <SelectField
                  label="Status da assinatura"
                  value={data.signatureStatus}
                  onChange={(value) => {
                    update('signatureStatus', value);
                  }}
                  options={SIGNATURE_STATUS_OPTIONS}
                />

                <TextField
                  label="Responsável pelo estúdio"
                  value={data.studioRepresentative}
                  onChange={(value) => {
                    update(
                      'studioRepresentative',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Contratante que assinará"
                  value={data.clientSigner}
                  onChange={(value) => {
                    update(
                      'clientSigner',
                      capitalizeName(value),
                    );
                  }}
                />

                <TextField
                  label="Testemunha 1"
                  value={data.witness1}
                  onChange={(value) => {
                    update(
                      'witness1',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Opcional"
                />

                <TextField
                  label="Testemunha 2"
                  value={data.witness2}
                  onChange={(value) => {
                    update(
                      'witness2',
                      capitalizeName(value),
                    );
                  }}
                  placeholder="Opcional"
                />
              </FieldGroup>
            </>
          )}

          {step === 8 && (
            <div className="contract-review">
              <h3>Revisão do contrato</h3>
              <p>
                Confira os dados abaixo. Essas informações serão
                utilizadas para preencher automaticamente o contrato.
              </p>

              <FieldGroup title="Contratante">
                <SummaryRow
                  label="Nome"
                  value={data.clientName}
                />
                <SummaryRow
                  label="CPF/CNPJ"
                  value={data.clientDocument}
                />
                <SummaryRow
                  label="Telefone"
                  value={data.clientPhone}
                />
                <SummaryRow
                  label="E-mail"
                  value={data.clientEmail}
                />
              </FieldGroup>

              <FieldGroup title="Evento">
                <SummaryRow
                  label="Serviço"
                  value={data.service}
                />
                <SummaryRow
                  label="Data"
                  value={formatDateForDisplay(data.eventDate)}
                />
                <SummaryRow
                  label="Local"
                  value={data.eventLocation}
                />
                <SummaryRow
                  label="Cobertura"
                  value={data.coverageType}
                />
              </FieldGroup>

              <FieldGroup title="Pacote e pagamento">
                <SummaryRow
                  label="Pacote"
                  value={data.packageName}
                />
                <SummaryRow
                  label="Valor total"
                  value={data.total}
                />
                <SummaryRow
                  label="Entrada"
                  value={data.deposit}
                />
                <SummaryRow
                  label="Saldo"
                  value={data.balance}
                />
                <SummaryRow
                  label="Parcelas"
                  value={data.installments}
                />
              </FieldGroup>

              <FieldGroup title="Assinatura">
                <SummaryRow
                  label="Cidade"
                  value={data.signatureCity}
                />
                <SummaryRow
                  label="Data"
                  value={formatDateForDisplay(
                    data.signatureDate,
                  )}
                />
                <SummaryRow
                  label="Forma"
                  value={data.signatureMethod}
                />
                <SummaryRow
                  label="Status"
                  value={data.signatureStatus}
                />
              </FieldGroup>
            </div>
          )}

          {step === 9 && (
            <div className="contract-pdf-step">
              <div className="contract-generated-preview">
                <CheckCircle2 size={36} />
                <h3>Contrato pronto para geração</h3>
                <p>
                  O PDF original será usado apenas como base jurídica.
                  Os dados revisados serão aplicados na cópia gerada
                  para este cliente.
                </p>

                <div className="contract-generated-summary">
                  <strong>{data.clientName}</strong>
                  <span>{data.service}</span>
                  <span>
                    {formatDateForDisplay(data.eventDate)}
                  </span>
                  <span>{data.total}</span>
                </div>
              </div>

              <button
                type="button"
                className="contract-generate"
                disabled={saving}
                onClick={finish}
              >
                <Download />
                {saving
                  ? 'Gerando PDF...'
                  : 'Gerar e baixar contrato'}
              </button>
            </div>
          )}
        </main>

        <footer>
          <button
            type="button"
            disabled={step === 0 || saving}
            onClick={goBack}
          >
            <ChevronLeft />
            Voltar
          </button>

          {step < STEPS.length - 1 && (
            <button
              type="button"
              className="next"
              disabled={saving}
              onClick={goNext}
            >
              Avançar
              <ChevronRight />
            </button>
          )}
        </footer>
      </section>
    </div>
  );
}
