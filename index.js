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

  if (result.paragraphs?.length) {
    for (const para of result.paragraphs) {
      lines.push(para.content || '');
    }
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
    const poller = await docClient.beginAnalyzeDocument("prebuilt-layout", fileBytes, {
      contentType: ext === '.pdf' ? 'application/pdf' : 'image/jpeg',
    });
    const result = await poller.pollUntilDone();
    return extractPlainTextFromAzureResult(result);
  } else {
    return await fs.readFile(filePath, 'utf8');
  }
}

// 🔧 Sanitize extracted OCR text like your .NET app
function sanitizeText(text) {
  return text.replace(/[^a-zA-Z0-9\s.,$#\-_\/]/g, '');
}

function buildPrompt(statementText) {
  return `
From the following text, please extract data and return only a JSON string that would deserialize to the following C# class:

public class StatementData
{
    public class Metadata
    {
        public string statementDate { get; set; }
        public string dateRange { get; set; }
        public string bankName { get; set; }
        public string accountNumber { get; set; }
        public string ownerName { get; set; }

        public string dateRangeStartDate { get; set; }
        public string dateRangeEndDate { get; set; }
        public string totalAmountOfDepositsAsReported { get; set; }
        public string totalAmountOfWithdrawalsAsReported { get; set; }
        public string totalCountOfDepositsAsReported { get; set; }
        public string totalCountOfWithdrawalsAsReported { get; set; }
    }

    public class Transaction
    {
        public string Date { get; set; }
        public string Description { get; set; }
        public string Amount { get; set; }
        public string DepositOrWithdrawal { get; set; }
        public string TransactionCategory { get; set; }
    }

    public Metadata metadata { get; set; }
    public Transaction[] transactions { get; set; }
}

For each transaction, suggest a TransactionCategory (e.g., Phone, Electricity, Fuel, Supplies, Maintenance, etc.)

Please include no explanation or commentary. Just return the raw JSON string only.

--- Begin Statement Text ---
${statementText}
--- End Statement Text ---
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

    const cleanText = sanitizeText(combinedText);
    console.log("🧼 Cleaned text length:", cleanText.length);

    const prompt = buildPrompt(cleanText);

    console.log("🟡 Prompt length:", prompt.length);
    console.log("🟡 Prompt preview:", prompt);

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 4096
    });

    let resultText = chatCompletion.choices?.[0]?.message?.content;

    console.log("✅ Finish reason:", chatCompletion.choices?.[0]?.finish_reason); // <-- Add this line
    console.log("🟢 Raw OpenAI response:");
    console.log(resultText?.substring(0, 3000) || '[empty]');

    try {
      let parsed;
      if (typeof resultText === 'object') {
        parsed = resultText;
      } else {
        const firstBrace = resultText.indexOf('{');
        const lastBrace = resultText.lastIndexOf('}');
        const jsonString = resultText.slice(firstBrace, lastBrace + 1);
        parsed = JSON.parse(jsonString);
      }

      res.json({ success: true, result: parsed });
    } catch (err) {
      console.error("🔴 JSON parse error:", err.message);
      res.status(500).json({
        success: false,
        error: "OpenAI response was not valid JSON.",
        raw: typeof resultText === 'object' ? JSON.stringify(resultText, null, 2) : resultText
      });
    }
  } catch (error) {
    console.error("🔴 Server error:", JSON.stringify(error, null, 2));
    res.status(500).json({
      success: false,
      error: typeof error === 'object' ? JSON.stringify(error, null, 2) : error.toString()
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
