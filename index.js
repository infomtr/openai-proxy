import express from 'express';
import cors from 'cors';
import multer from 'multer';
import fs from 'fs/promises';
import path from 'path';
import { OpenAI } from 'openai';
import dotenv from 'dotenv';
import { DocumentAnalysisClient, AzureKeyCredential } from '@azure/ai-document-intelligence';

dotenv.config();

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

const azureEndpoint = process.env.AZURE_ENDPOINT;
const azureKey = process.env.AZURE_KEY;

let docClient;
if (azureEndpoint && azureKey) {
  docClient = new DocumentAnalysisClient(azureEndpoint, new AzureKeyCredential(azureKey));
}

const app = express();
app.use(cors());
app.use(express.json());

const upload = multer({ dest: 'uploads/' });

// Utility: determine if file extension indicates PDF/image
function isPdfOrImage(filename) {
  const ext = path.extname(filename).toLowerCase();
  return ['.pdf', '.jpg', '.jpeg', '.png', '.tiff', '.bmp', '.gif'].includes(ext);
}

// Extract text from a plain‑text file
async function extractTextFromTxt(filePath) {
  return fs.readFile(filePath, 'utf8');
}

// Use Azure Document Intelligence to analyze a bank statement
async function analyzeWithAzure(filePath) {
  const fileBytes = await fs.readFile(filePath);
  const contentType = "application/pdf"; // you may adjust based on extension (image/jpeg etc)

  const poller = await docClient.beginAnalyzeDocument(
    "prebuilt‑bankStatement.us",
    fileBytes,
    {
      contentType,
      // optional splitMode: "auto" if you require splitting multi‑statement PDFs
      // splitMode: "auto"
    }
  );

  const result = await poller.pollUntilDone();
  // Convert the result into a raw text extract or JSON extract as needed.
  // For simplicity: we’ll serialize the result JSON to a string and return it.
  return JSON.stringify(result);
}

async function extractTextFromFile(filePath, originalName) {
  if (isPdfOrImage(originalName) && docClient) {
    try {
      return await analyzeWithAzure(filePath);
    } catch (err) {
      console.error("Azure analysis failed:", err);
      // fallback: attempt reading as text
      return await extractTextFromTxt(filePath);
    }
  } else {
    return await extractTextFromTxt(filePath);
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

    const resultJson = chatCompletion.choices[0].message.content;
    // Optionally parse to object here
    res.json({ success: true, result: resultJson });
  } catch (error) {
    console.error("Error processing files:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
