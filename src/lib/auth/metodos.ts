import 'server-only'

export function metodosAcceso() {
  return {
    google: process.env.AUTH_GOOGLE_ENABLED === 'true',
    apple: process.env.AUTH_APPLE_ENABLED === 'true',
    magicLink: process.env.AUTH_MAGIC_LINK_ENABLED === 'true',
    sms: process.env.AUTH_SMS_ENABLED === 'true',
  }
}