import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-form-recognizer';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const azureEndpoint = process.env.AZURE_ENDPOINT;
const azureKey = process.env.AZURE_KEY;
const docClient = new DocumentAnalysisClient(azureEndpoint, new AzureKeyCredential(azureKey));

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

function isPdfOrImage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp'].includes(ext);
}

function extractPlainTextFromAzureResult(result) {
  const lines = [];

  if (result.content) {
    lines.push(result.content);
  } else if (result.pages?.length) {
    for (const page of result.pages) {
      for (const line of page.lines || []) {
        lines.push(line.content || '');
      }
    }
  }

  return lines.join('\n');
}

async function extractTextFromFile(filePath, originalName) {
  const fileBytes = await fs.readFile(filePath);
  const ext = path.extname(originalName).toLowerCase();

  if (isPdfOrImage(originalName)) {
    const poller = await docClient.beginAnalyzeDocument("prebuilt-read", fileBytes, {
  contentType: ext === '.pdf' ? 'application/pdf' : 'image/jpeg',
});
    const result = await poller.pollUntilDone();
    return extractPlainTextFromAzureResult(result);
  } else {
    return await fs.readFile(filePath, 'utf8');
  }
}

function buildPrompt(statementText) {
  return `
Extract the following from the bank statement text below:
1. Metadata: Owner Name, Bank Name, Account Number, Statement Date,
   DateRangeStartDate, DateRangeEndDate,
   TotalAmountOfDepositsAsReported (if present),
   TotalAmountOfWithdrawalsAsReported (if present),
   TotalCountOfDepositsAsReported (if present),
   TotalCountOfWithdrawalsAsReported (if present)
2. Transactions: Array of objects { Date, Description, Amount, DepositOrWithdrawal, TransactionCategory }

For each transaction, suggest a TransactionCategory (e.g., Phone, Electricity, Fuel, Supplies, Maintenance, etc.)
Return JSON with this structure:
{
  "metadata": {
    "ownerName": "",
    "bankName": "",
    "accountNumber": "",
    "statementDate": "",
    "dateRangeStartDate": "",
    "dateRangeEndDate": "",
    "totalAmountOfDepositsAsReported": null,
    "totalAmountOfWithdrawalsAsReported": null,
    "totalCountOfDepositsAsReported": null,
    "totalCountOfWithdrawalsAsReported": null
  },
  "transactions": [
    {
      "date": "",
      "description": "",
      "amount": 0.0,
      "depositOrWithdrawal": "",
      "transactionCategory": ""
    }
  ]
}

Statement text:
"""${statementText}"""
Return the result as **raw JSON only** — no commentary or explanation.
`;
}

app.post('/processFiles', upload.array('files', 12), async (req, res) => {
  try {
    const files = req.files;
    if (!files || files.length === 0) {
      return res.status(400).json({ success: false, error: 'No files uploaded.' });
    }

    let combinedText = '';
    for (const file of files) {
      const text = await extractTextFromFile(file.path, file.originalname);
      combinedText += '\n\n' + text;
      await fs.unlink(file.path);
    }

    const prompt = buildPrompt(combinedText);

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2
    });

    let resultText = chatCompletion.choices[0].message.content;

// Attempt to extract first JSON object from response
const firstBrace = resultText.indexOf('{');
const lastBrace = resultText.lastIndexOf('}');
const jsonString = resultText.slice(firstBrace, lastBrace + 1);

try {
  const parsed = JSON.parse(jsonString);
  res.json({ success: true, result: parsed });
} catch (err) {
  console.error("Failed to parse JSON:", err);
  res.status(500).json({
    success: false,
    error: "OpenAI response was not valid JSON.",
    raw: resultText
  });
}
  } catch (error) {
    console.error("Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
