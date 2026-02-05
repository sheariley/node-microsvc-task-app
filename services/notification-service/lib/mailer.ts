import type { TaskAppServerConfig } from 'ms-task-app-common';
import nodemailer from 'nodemailer'

export type MailerOptions = TaskAppServerConfig['smtp'] & {
  fromEmail?: string
}

export type Mailer = {
  send(to: string, subject: string, body: string): Promise<{ messageId: string }>
}

export function createMailer({ host, port, user, pass, fromEmail }: MailerOptions): Mailer {
  const mailTransport = nodemailer.createTransport({
      host,
      port,
      secure: false,
      auth: {
        user,
        pass,
      },
    })

  return {
    async send(to: string, subject: string, body: string) {
      const deferred = Promise.withResolvers<{ messageId: string }>()
      
      const result = await mailTransport.sendMail({
        from: fromEmail,
        to,
        subject,
        text: body
      })

      if (!result.accepted.length) {
        deferred.reject(new Error('No recipient addresses were accepted.'))
      } else {
        deferred.resolve({ messageId: result.messageId })
      }

      return deferred.promise
    }
  }
}