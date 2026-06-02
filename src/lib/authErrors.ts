/**
 * Maps Supabase auth error messages to user-friendly Portuguese (pt-PT) strings.
 */

const AUTH_ERROR_MAP: Array<[pattern: string, message: string]> = [
  ['Invalid login credentials', 'Credenciais inválidas. Verifique o e-mail e a palavra-passe.'],
  ['Email not confirmed', 'E-mail não confirmado. Verifique a sua caixa de correio.'],
  ['User already registered', 'Este e-mail já está registado. Por favor, inicie sessão.'],
  ['Password should be at least 6 characters', 'A palavra-passe deve ter pelo menos 6 caracteres.'],
  ['Unable to validate email address', 'Formato de e-mail inválido.'],
  ['Email rate limit exceeded', 'Demasiadas tentativas. Aguarde alguns minutos e tente novamente.'],
  ['over_email_send_rate_limit', 'Demasiados e-mails enviados. Aguarde alguns minutos.'],
  ['signup_disabled', 'O registo de novas contas está desativado.'],
  ['Too many requests', 'Demasiadas tentativas. Tente novamente mais tarde.'],
  ['Network request failed', 'Sem ligação à rede. Verifique a sua ligação e tente novamente.'],
  ['Invalid email', 'Endereço de e-mail inválido.'],
  ['Signup requires a valid password', 'É necessária uma palavra-passe válida para criar conta.'],
  ['For security purposes', 'Por razões de segurança, aguarde alguns segundos antes de tentar novamente.'],
];

export function mapAuthError(err: unknown): string {
  if (!err) return 'Ocorreu um erro inesperado.';

  const message = err instanceof Error ? err.message : String(err);

  for (const [pattern, translation] of AUTH_ERROR_MAP) {
    if (message.includes(pattern)) return translation;
  }

  return message || 'Ocorreu um erro inesperado.';
}
