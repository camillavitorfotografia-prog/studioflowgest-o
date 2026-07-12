import { supabase } from './supabase';

export const getEmailConfirmationRedirect = () => `${window.location.origin}/login?email_confirmed=true`;

const isNetworkError = (error) => {
  const message = String(error?.message || '').toLowerCase();
  return error instanceof TypeError
    || message.includes('failed to fetch')
    || message.includes('network')
    || message.includes('fetch');
};

export const getEmailAuthMessage = (error, fallback = 'Não foi possível concluir o cadastro. Tente novamente.') => {
  if (isNetworkError(error)) return 'Erro de conexão. Verifique sua internet e tente novamente.';

  const message = String(error?.message || '').toLowerCase();
  const code = String(error?.code || '').toLowerCase();

  if (code === 'user_already_exists' || message.includes('already registered') || message.includes('already exists')) {
    return 'Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.';
  }
  if (code === 'weak_password' || message.includes('password') && (message.includes('weak') || message.includes('least'))) {
    return 'A senha é muito fraca. Use pelo menos 6 caracteres e evite senhas fáceis de adivinhar.';
  }
  if (code === 'email_address_invalid' || message.includes('invalid email') || message.includes('email address is invalid')) {
    return 'Informe um endereço de e-mail válido.';
  }
  if (code === 'email_address_not_authorized' || message.includes('email address not authorized')) {
    return 'Não foi possível enviar a confirmação para este e-mail. Verifique a configuração de SMTP do Supabase.';
  }
  if (code === 'over_email_send_rate_limit' || message.includes('rate limit') || message.includes('email rate limit')) {
    return 'Muitas tentativas de envio. Aguarde alguns minutos antes de tentar novamente.';
  }
  if (message.includes('sending confirmation') || message.includes('confirmation email') || message.includes('error sending')) {
    return 'Erro ao enviar o e-mail de confirmação. Tente novamente em instantes.';
  }

  return fallback;
};

export const validateRegistration = ({ email, password }) => {
  const normalizedEmail = email.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
    throw new Error('Informe um endereço de e-mail válido.');
  }
  if (password.length < 6) {
    throw new Error('A senha é muito fraca. Use pelo menos 6 caracteres.');
  }
  return normalizedEmail;
};

export const assertNewEmailRegistration = (data) => {
  if (data?.user && Array.isArray(data.user.identities) && data.user.identities.length === 0) {
    throw new Error('Este e-mail já está cadastrado. Entre na sua conta ou recupere a senha.');
  }
};

export const resendSignupConfirmation = async (email) => {
  try {
    const { error } = await supabase.auth.resend({
      type: 'signup',
      email: email.trim().toLowerCase(),
      options: { emailRedirectTo: getEmailConfirmationRedirect() },
    });
    if (error) throw error;
  } catch (error) {
    throw new Error(
      getEmailAuthMessage(error, 'Erro ao reenviar o e-mail de confirmação. Tente novamente.'),
      { cause: error }
    );
  }
};
