import { config } from "dotenv";

if (process.env.NODE_ENV !== 'production') {
  config()
}

import * as fs from "fs";
import { input } from "@inquirer/prompts";
import { remark } from 'remark';
import remarkGfm from "remark-gfm";
import remarkHtml from 'remark-html';
import remarkFrontmatter from "remark-frontmatter";
import remarkParseFrontmatter from "remark-parse-frontmatter";
// Brevo (sendinblue) sdk
import SibApiV3Sdk from "sib-api-v3-sdk";
import options from "./config.js"

(async () => {
  const markdownFile = await input({
    message: "Enter path to markdown file:"
  })

  let header = "", footer = ""

  if (options.header) {
    const headerContent = fs.readFileSync(options.header, "utf-8", (err,_) => {
      if (err) throw new Error(err)
    })
    const { value } = await remark().use(remarkHtml, { sanitize: false }).process(headerContent)
    header = value
  }

  if (options.footer) {
    const footerContent = fs.readFileSync(options.footer, "utf-8", (err,_) => {
      if (err) throw new Error(err)
    })
    const { value } = await remark().use(remarkHtml, { sanitize: false }).process(footerContent)
    footer = value
  }

  const content = fs.readFileSync(markdownFile, "utf-8", (err,_) => {
    if (err) throw new Error("Unable to read file")
  });
  
  const { data: { frontmatter }, value: body } = remark()
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
    .use(remarkGfm)
    .use(remarkHtml, { sanitize: false })
    .processSync(content)

  const templateId = frontmatter?.id
  const html = `<!DOCTTYPE html><html><head><meta http-equiv="Content-Type" content="text/html; charset=utf-8"><meta http-equiv="X-UA-Compatible" content="IE=edge"><meta name="format-detection" content="telephone=no"><meta name="viewport" content="width=device-width, initial-scale=1.0"><title>${frontmatter.title ?? ""}</title><style type="text/css">a, a:link { color: #343434; text-decoration: underline; word-break: break-word; } p, a { font-size: 14px; } .footer p { font-size: 12px !important; } .footer a { font-size: 12px !important; }</style>
<!--[if mso]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]--></head><body>${header}${body}${footer}</body></html>`

  let defaultClient = SibApiV3Sdk.ApiClient.instance;

  let apiKey = defaultClient.authentications['api-key'];
  apiKey.apiKey = process.env.BREVO_API_KEY;

  let defaultSender = {}
  let apiSenderInstance = new SibApiV3Sdk.SendersApi()

  await apiSenderInstance.getSenders().then(function(data) {
    defaultSender = data.senders[data.senders.length - 1]
  }, function(error) {
    console.error(error);
  });

  let apiInstance = new SibApiV3Sdk.TransactionalEmailsApi()
  let smtpTemplate

  if (templateId) {
    smtpTemplate = new SibApiV3Sdk.UpdateSmtpTemplate()
    await apiInstance.getSmtpTemplates().then(function(data) {
      const existingTemplate = data.templates.find(t => t.id === templateId)
      smtpTemplate.sender = {
        "name": frontmatter?.senderName ?? existingTemplate.sender.name,
        "email": frontmatter?.senderEmail ?? existingTemplate.sender.email
      };
      smtpTemplate.templateName = frontmatter?.title ?? existingTemplate.name;
      smtpTemplate.subject = frontmatter?.subject ?? existingTemplate.subject;
      smtpTemplate.replyTo = frontmatter?.replyTo ?? existingTemplate.replyTo;
    }, function(error) {
      console.error(error);
    });
  } else {
    smtpTemplate = new SibApiV3Sdk.CreateSmtpTemplate();
    smtpTemplate.sender = {
      "name": frontmatter?.senderName ?? defaultSender.name,
      "email": frontmatter?.senderEmail ?? defaultSender.email
    };
    smtpTemplate.templateName = frontmatter?.title ?? "Example Template";
    smtpTemplate.subject = frontmatter?.subject ?? "New Subject";
    smtpTemplate.replyTo = frontmatter?.replyTo ?? '[DEFAULT_REPLY_TO]';
  }
  
  smtpTemplate.htmlContent = html;
  smtpTemplate.isActive = true;

  if (templateId) {
    await apiInstance.updateSmtpTemplate(templateId, smtpTemplate).then(function() {
      console.log(`Email template #${templateId} updated sucessfully.`);
    }, function(error) {
      console.error({status: error.response.status, ...error.response.body});
    });
  } else {
    await apiInstance.createSmtpTemplate(smtpTemplate).then(function(data) {
      // Add the template id to frontmatter
      let updatedContent
      if (frontmatter) {
        updatedContent = content.replace(/^(.*)$/m, `---\nid: ${data.id}`)
      } else {
        updatedContent = `---\nid: ${data.id}\n---\n\n${content}`
      }
      fs.writeFileSync(markdownFile, updatedContent, "utf-8")
      console.log('Template created successfully with templateId: ' + data.id);
    }, function(error) {
      console.error({status: error.response.status, ...error.response.body});
    });
  }
})()
