import * as path from "path";
import * as fs from "fs";

import format from "date-fns/format";

import * as Handlebars from "handlebars";

import { Handler } from "aws-lambda";
import chromium from 'chrome-aws-lambda';
import { S3 } from 'aws-sdk';

import { document } from '../utils/dynamodbClient';

type ICreateCertificate = {
  id: string;
  name: string;
  grade: string;
};

type ITemplate = {
  id: string;
  name: string;
  grade: string;
  date: string;
  medal: string;
};

const compile = async function (data: ITemplate) {
  const filePath = path.join(process.cwd(), 'src', 'templates', 'certificate.hbs');
  const html = fs.readFileSync(filePath, 'utf8');

  const template = Handlebars.compile(html);
  return template(data);
}

export const handle: Handler = async (event: any) => {
  const { id, name, grade } = JSON.parse(event.body) as ICreateCertificate;

  await document.put({
    TableName: "users_certificates",
    Item: {
      id,
      name,
      grade
    }
  }).promise();

  //Gerando o certificado
  const medaPath = path.join(process.cwd(), 'src', 'templates', 'selo.png');
  const medal = fs.readFileSync(medaPath, 'base64');

  const data: ITemplate = {
    id,
    name,
    grade,
    medal,
    date: format(new Date(), 'dd/MM/yyyy'),
  }

  const content = await compile(data);

  const browser = await chromium.puppeteer.launch({
    headless: true,
    args: chromium.args,
    defaultViewport: chromium.defaultViewport,
    executablePath: await chromium.executablePath,
  });

  const page = await browser.newPage();
  await page.setContent(content);

  const pdf = await page.pdf({
    format: "a4",
    landscape: true,
    path: process.env.IS_OFFLINE ? 'certificado.pdf' : null,
    printBackground: true,
    preferCSSPageSize: true,
  });

  await browser.close();

  const s3 = new S3({
    region: process.env.REGION || 'us-east-1'
  });

  await s3.putObject({
    Bucket: 'ignitecertificate',
    Key: `${id}.pdf`,
    ACL: 'public-read',
    Body: pdf,
    ContentType: 'application/pdf'
  }).promise();

  return {
    statusCode: 201,
    body: JSON.stringify({
      message: "Certificate Created",
      url: `https://ignitecertificate.s3-sa-east-1.amazonaws.com/${id}.pdf`
    }),
    headers: {
      "Content-Type": "application/json"
    }
  }
}

/* Script para consultar no DynamoDB  */
// var params = {
//   TableName : "users_certificates"
// }

// dynamodb.scan(params, onScan);

// function onScan(err, data){
//   if(err){
//     console.error("Unable to scan the database. Error: " + JSON.stringify(err));
//   }else{
//     console.log("Scan success");
//     console.log(data);
//   }
// }