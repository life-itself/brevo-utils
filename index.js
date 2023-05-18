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

(async () => {
  const markdownFile = await input({
    message: "Enter path to markdown file:"
  })

  const content = fs.readFileSync(markdownFile, "utf-8", (err,_) => {
    if (err) throw new Error("Unable to read file")
  });
  
  const { data: { frontmatter }, value } = remark()
    .use(remarkFrontmatter)
    .use(remarkParseFrontmatter)
    .use(remarkGfm)
    .use(remarkHtml)
    .processSync(content)

  const templateId = frontmatter?.id
  const html = `<!DOCTTYPE html><html><body>${value}</body></html>`

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
  
  smtpTemplate.toField = '{FNAME}'
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
      console.log('Template created successfully with templateId: ' + data.id);
    }, function(error) {
      console.error({status: error.response.status, ...error.response.body});
    });
  }
})()
