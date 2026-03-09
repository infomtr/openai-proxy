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

// Default GL Code List to use if none is provided in the request
const DEFAULT_GL_CODE_LIST = [
  { "Title": "Accounts Receivable (Debtors)", "AccountClass": "ASSET", "GL_Code": "1001" },
  { "Title": "Cash", "AccountClass": "ASSET", "GL_Code": "1002" },
  { "Title": "Deferred Tax", "AccountClass": "ASSET", "GL_Code": "1003" },
  { "Title": "Deposit (paid by Tenant)", "AccountClass": "ASSET", "GL_Code": "1004" },
  { "Title": "EQUIPMENT", "AccountClass": "ASSET", "GL_Code": "1005" },
  { "Title": "Inventory or Stock", "AccountClass": "ASSET", "GL_Code": "1006" },
  { "Title": "Loan (Lending)", "AccountClass": "ASSET", "GL_Code": "1007" },
  { "Title": "Real Estate/ Buildings/Property", "AccountClass": "ASSET", "GL_Code": "1008" },
  { "Title": "Vehicles/ Trucks", "AccountClass": "ASSET", "GL_Code": "1009" },
  { "Title": "Accounts Payable (Creditors)", "AccountClass": "LIABILITY", "GL_Code": "2001" },
  { "Title": "Deferred Tax", "AccountClass": "LIABILITY", "GL_Code": "2002" },
  { "Title": "Loan (Borrowings)", "AccountClass": "LIABILITY", "GL_Code": "2003" },
  { "Title": "Cryptocurrency", "AccountClass": "CAPITAL", "GL_Code": "3001" },
  { "Title": "Digital Assets", "AccountClass": "CAPITAL", "GL_Code": "3002" },
  { "Title": "Money Transfer", "AccountClass": "CAPITAL", "GL_Code": "3003" },
  { "Title": "Owner Drawings", "AccountClass": "CAPITAL", "GL_Code": "3004" },
  { "Title": "Reserves", "AccountClass": "CAPITAL", "GL_Code": "3005" },
  { "Title": "Revaluation Reserve", "AccountClass": "CAPITAL", "GL_Code": "3006" },
  { "Title": "Share Capirtal", "AccountClass": "CAPITAL", "GL_Code": "3007" },
  { "Title": "Transfer From", "AccountClass": "CAPITAL", "GL_Code": "3008" },
  { "Title": "Transfer To", "AccountClass": "CAPITAL", "GL_Code": "3009" },
  { "Title": "Alimony Received", "AccountClass": "INCOME", "GL_Code": "4001" },
  { "Title": "Foreign Income", "AccountClass": "INCOME", "GL_Code": "4002" },
  { "Title": "Gambling Income", "AccountClass": "INCOME", "GL_Code": "4003" },
  { "Title": "Income", "AccountClass": "INCOME", "GL_Code": "4004" },
  { "Title": "Interest Income", "AccountClass": "INCOME", "GL_Code": "4005" },
  { "Title": "Miscelleneous Income", "AccountClass": "INCOME", "GL_Code": "4006" },
  { "Title": "Rental Income", "AccountClass": "INCOME", "GL_Code": "4007" },
  { "Title": "Unemployment compensation", "AccountClass": "INCOME", "GL_Code": "4008" },
  { "Title": "Accommodation", "AccountClass": "EXPENSE", "GL_Code": "5001" },
  { "Title": "Accounting  Services", "AccountClass": "EXPENSE", "GL_Code": "5002" },
  { "Title": "Accounting Software", "AccountClass": "EXPENSE", "GL_Code": "5003" },
  { "Title": "Advertising", "AccountClass": "EXPENSE", "GL_Code": "5004" },
  { "Title": "Agent Fee", "AccountClass": "EXPENSE", "GL_Code": "5005" },
  { "Title": "Alimony Paid", "AccountClass": "EXPENSE", "GL_Code": "5006" },
  { "Title": "Allowances (Expense)", "AccountClass": "EXPENSE", "GL_Code": "5007" },
  { "Title": "AntiVirus Software", "AccountClass": "EXPENSE", "GL_Code": "5008" },
  { "Title": "Armotization", "AccountClass": "EXPENSE", "GL_Code": "5009" },
  { "Title": "Auction Fee", "AccountClass": "EXPENSE", "GL_Code": "5010" },
  { "Title": "Auto & Travel expenses", "AccountClass": "EXPENSE", "GL_Code": "5011" },
  { "Title": "Auto Parts", "AccountClass": "EXPENSE", "GL_Code": "5012" },
  { "Title": "Bank Fees", "AccountClass": "EXPENSE", "GL_Code": "5013" },
  { "Title": "Business Entertainment", "AccountClass": "EXPENSE", "GL_Code": "5014" },
  { "Title": "Business Meetings", "AccountClass": "EXPENSE", "GL_Code": "5015" },
  { "Title": "Business Travel", "AccountClass": "EXPENSE", "GL_Code": "5016" },
  { "Title": "Capital Gains Tax", "AccountClass": "EXPENSE", "GL_Code": "5017" },
  { "Title": "Car Rental ", "AccountClass": "EXPENSE", "GL_Code": "5018" },
  { "Title": "Car Truck Wash", "AccountClass": "EXPENSE", "GL_Code": "5019" },
  { "Title": "Card Services Fee", "AccountClass": "EXPENSE", "GL_Code": "5020" },
  { "Title": "Cash Register Fee", "AccountClass": "EXPENSE", "GL_Code": "5021" },
  { "Title": "Cell Phone", "AccountClass": "EXPENSE", "GL_Code": "5022" },
  { "Title": "Charge Back Fee", "AccountClass": "EXPENSE", "GL_Code": "5023" },
  { "Title": "Charity Donations", "AccountClass": "EXPENSE", "GL_Code": "5024" },
  { "Title": "Child Support Services  Expense", "AccountClass": "EXPENSE", "GL_Code": "5025" },
  { "Title": "City Tax", "AccountClass": "EXPENSE", "GL_Code": "5026" },
  { "Title": "Cleaning Services", "AccountClass": "EXPENSE", "GL_Code": "5027" },
  { "Title": "Cleaning Supplies", "AccountClass": "EXPENSE", "GL_Code": "5028" },
  { "Title": "Commission Fee", "AccountClass": "EXPENSE", "GL_Code": "5029" },
  { "Title": "Comptroller Tax", "AccountClass": "EXPENSE", "GL_Code": "5030" },
  { "Title": "Contract Labor", "AccountClass": "EXPENSE", "GL_Code": "5031" },
  { "Title": "Cost of Goods", "AccountClass": "EXPENSE", "GL_Code": "5032" },
  { "Title": "County Registration", "AccountClass": "EXPENSE", "GL_Code": "5033" },
  { "Title": "Depreciation ", "AccountClass": "EXPENSE", "GL_Code": "5034" },
  { "Title": "Discount Expense", "AccountClass": "EXPENSE", "GL_Code": "5035" },
  { "Title": "Dispatch Fee", "AccountClass": "EXPENSE", "GL_Code": "5036" },
  { "Title": "DOT - Department of Transport", "AccountClass": "EXPENSE", "GL_Code": "5037" },
  { "Title": "Drug Test Fee", "AccountClass": "EXPENSE", "GL_Code": "5038" },
  { "Title": "Education Fees", "AccountClass": "EXPENSE", "GL_Code": "5039" },
  { "Title": "ELD - Electronic Logging Device", "AccountClass": "EXPENSE", "GL_Code": "5040" },
  { "Title": "Electricity", "AccountClass": "EXPENSE", "GL_Code": "5041" },
  { "Title": "Entertainment", "AccountClass": "EXPENSE", "GL_Code": "5042" },
  { "Title": "Equipment Rental", "AccountClass": "EXPENSE", "GL_Code": "5043" },
  { "Title": "Exchange rate fees", "AccountClass": "EXPENSE", "GL_Code": "5044" },
  { "Title": "Factoring Fee", "AccountClass": "EXPENSE", "GL_Code": "5045" },
  { "Title": "Fed Hwy 2290 Fee", "AccountClass": "EXPENSE", "GL_Code": "5046" },
  { "Title": "Finance Fee", "AccountClass": "EXPENSE", "GL_Code": "5047" },
  { "Title": "Fleet Operation Expense", "AccountClass": "EXPENSE", "GL_Code": "5048" },
  { "Title": "FMCSA Fee", "AccountClass": "EXPENSE", "GL_Code": "5049" },
  { "Title": "Foreign Employee Payment", "AccountClass": "EXPENSE", "GL_Code": "5050" },
  { "Title": "Franchise Fee", "AccountClass": "EXPENSE", "GL_Code": "5051" },
  { "Title": "Franchise Tax", "AccountClass": "EXPENSE", "GL_Code": "5052" },
  { "Title": "Freight expense", "AccountClass": "EXPENSE", "GL_Code": "5053" },
  { "Title": "Fuel", "AccountClass": "EXPENSE", "GL_Code": "5054" },
  { "Title": "Gambling Expense", "AccountClass": "EXPENSE", "GL_Code": "5055" },
  { "Title": "Gardening Expense", "AccountClass": "EXPENSE", "GL_Code": "5056" },
  { "Title": "Gateway Fee", "AccountClass": "EXPENSE", "GL_Code": "5057" },
  { "Title": "Gift", "AccountClass": "EXPENSE", "GL_Code": "5058" },
  { "Title": "Groceries", "AccountClass": "EXPENSE", "GL_Code": "5059" },
  { "Title": "Hire Fee", "AccountClass": "EXPENSE", "GL_Code": "5060" },
  { "Title": "IFTA Fee", "AccountClass": "EXPENSE", "GL_Code": "5061" },
  { "Title": "Inspection Fee", "AccountClass": "EXPENSE", "GL_Code": "5062" },
  { "Title": "Insurance", "AccountClass": "EXPENSE", "GL_Code": "5063" },
  { "Title": "Interest Expense", "AccountClass": "EXPENSE", "GL_Code": "5064" },
  { "Title": "Internet/Wifi", "AccountClass": "EXPENSE", "GL_Code": "5065" },
  { "Title": "IRS  or Federal Income Tax", "AccountClass": "EXPENSE", "GL_Code": "5066" },
  { "Title": "IT Services", "AccountClass": "EXPENSE", "GL_Code": "5067" },
  { "Title": "Jury Duty", "AccountClass": "EXPENSE", "GL_Code": "5068" },
  { "Title": "Landscaping Expense", "AccountClass": "EXPENSE", "GL_Code": "5069" },
  { "Title": "Lease Expense", "AccountClass": "EXPENSE", "GL_Code": "5070" },
  { "Title": "Legal Expense", "AccountClass": "EXPENSE", "GL_Code": "5071" },
  { "Title": "Load Board Fee", "AccountClass": "EXPENSE", "GL_Code": "5072" },
  { "Title": "Locksmith Fee", "AccountClass": "EXPENSE", "GL_Code": "5073" },
  { "Title": "Logistics expense", "AccountClass": "EXPENSE", "GL_Code": "5074" },
  { "Title": "Lottery Ticket or Fee", "AccountClass": "EXPENSE", "GL_Code": "5075" },
  { "Title": "Marketing Expense", "AccountClass": "EXPENSE", "GL_Code": "5076" },
  { "Title": "Materials Purchases", "AccountClass": "EXPENSE", "GL_Code": "5077" },
  { "Title": "Meals", "AccountClass": "EXPENSE", "GL_Code": "5078" },
  { "Title": "Medical expense", "AccountClass": "EXPENSE", "GL_Code": "5079" },
  { "Title": "Membership Fee", "AccountClass": "EXPENSE", "GL_Code": "5080" },
  { "Title": "Merchandising Expense", "AccountClass": "EXPENSE", "GL_Code": "5081" },
  { "Title": "Miscellaneous expense", "AccountClass": "EXPENSE", "GL_Code": "5082" },
  { "Title": "Mortgage interest", "AccountClass": "EXPENSE", "GL_Code": "5083" },
  { "Title": "Office expenses", "AccountClass": "EXPENSE", "GL_Code": "5084" },
  { "Title": "Office Supplies", "AccountClass": "EXPENSE", "GL_Code": "5085" },
  { "Title": "Online Marketplace Fee", "AccountClass": "EXPENSE", "GL_Code": "5086" },
  { "Title": "Overtime", "AccountClass": "EXPENSE", "GL_Code": "5087" },
  { "Title": "Packaging", "AccountClass": "EXPENSE", "GL_Code": "5088" },
  { "Title": "Parking", "AccountClass": "EXPENSE", "GL_Code": "5089" },
  { "Title": "Parks", "AccountClass": "EXPENSE", "GL_Code": "5090" },
  { "Title": "Payroll", "AccountClass": "EXPENSE", "GL_Code": "5091" },
  { "Title": "Payroll Fee", "AccountClass": "EXPENSE", "GL_Code": "5092" },
  { "Title": "Payroll Tax", "AccountClass": "EXPENSE", "GL_Code": "5093" },
  { "Title": "Penalty", "AccountClass": "EXPENSE", "GL_Code": "5094" },
  { "Title": "Permits & Licensing", "AccountClass": "EXPENSE", "GL_Code": "5095" },
  { "Title": "Pest Control Expense", "AccountClass": "EXPENSE", "GL_Code": "5096" },
  { "Title": "Photocopying ", "AccountClass": "EXPENSE", "GL_Code": "5097" },
  { "Title": "Photography", "AccountClass": "EXPENSE", "GL_Code": "5098" },
  { "Title": "POS  - Point of Sale Fee", "AccountClass": "EXPENSE", "GL_Code": "5099" },
  { "Title": "Power", "AccountClass": "EXPENSE", "GL_Code": "5100" },
  { "Title": "Prepass Expense", "AccountClass": "EXPENSE", "GL_Code": "5101" },
  { "Title": "Processing Fee", "AccountClass": "EXPENSE", "GL_Code": "5102" },
  { "Title": "Producer Fee", "AccountClass": "EXPENSE", "GL_Code": "5103" },
  { "Title": "Professional Fee", "AccountClass": "EXPENSE", "GL_Code": "5104" },
  { "Title": "Promotional Discount", "AccountClass": "EXPENSE", "GL_Code": "5105" },
  { "Title": "Property Management Fee", "AccountClass": "EXPENSE", "GL_Code": "5106" },
  { "Title": "Property Tax", "AccountClass": "EXPENSE", "GL_Code": "5107" },
  { "Title": "Purchases", "AccountClass": "EXPENSE", "GL_Code": "5108" },
  { "Title": "Recreation expense", "AccountClass": "EXPENSE", "GL_Code": "5109" },
  { "Title": "Recurring charge", "AccountClass": "EXPENSE", "GL_Code": "5110" },
  { "Title": "Refund Fee", "AccountClass": "EXPENSE", "GL_Code": "5111" },
  { "Title": "Regulatory Expenses", "AccountClass": "EXPENSE", "GL_Code": "5112" },
  { "Title": "Reimbursements", "AccountClass": "EXPENSE", "GL_Code": "5113" },
  { "Title": "Rental or Lease Fee", "AccountClass": "EXPENSE", "GL_Code": "5114" },
  { "Title": "Repairs & Maintenance", "AccountClass": "EXPENSE", "GL_Code": "5115" },
  { "Title": "Safety Services", "AccountClass": "EXPENSE", "GL_Code": "5116" },
  { "Title": "Salary", "AccountClass": "EXPENSE", "GL_Code": "5117" },
  { "Title": "Sales Tax", "AccountClass": "EXPENSE", "GL_Code": "5118" },
  { "Title": "Scale Fee", "AccountClass": "EXPENSE", "GL_Code": "5119" },
  { "Title": "Secretary of State Fees", "AccountClass": "EXPENSE", "GL_Code": "5120" },
  { "Title": "Security", "AccountClass": "EXPENSE", "GL_Code": "5121" },
  { "Title": "Service Charges", "AccountClass": "EXPENSE", "GL_Code": "5122" },
  { "Title": "Shipping", "AccountClass": "EXPENSE", "GL_Code": "5123" },
  { "Title": "Software", "AccountClass": "EXPENSE", "GL_Code": "5124" },
  { "Title": "State Tax", "AccountClass": "EXPENSE", "GL_Code": "5125" },
  { "Title": "Stationery", "AccountClass": "EXPENSE", "GL_Code": "5126" },
  { "Title": "Storage Fee", "AccountClass": "EXPENSE", "GL_Code": "5127" },
  { "Title": "Subscriptions", "AccountClass": "EXPENSE", "GL_Code": "5128" },
  { "Title": "Supplies", "AccountClass": "EXPENSE", "GL_Code": "5129" },
  { "Title": "Support Services Fee", "AccountClass": "EXPENSE", "GL_Code": "5130" },
  { "Title": "Tax Services", "AccountClass": "EXPENSE", "GL_Code": "5131" },
  { "Title": "Taxes", "AccountClass": "EXPENSE", "GL_Code": "5132" },
  { "Title": "Telecomminications", "AccountClass": "EXPENSE", "GL_Code": "5133" },
  { "Title": "Telephone Expense", "AccountClass": "EXPENSE", "GL_Code": "5134" },
  { "Title": "Tips", "AccountClass": "EXPENSE", "GL_Code": "5135" },
  { "Title": "Tolls", "AccountClass": "EXPENSE", "GL_Code": "5136" },
  { "Title": "Towing", "AccountClass": "EXPENSE", "GL_Code": "5137" },
  { "Title": "Transfer Fee", "AccountClass": "EXPENSE", "GL_Code": "5138" },
  { "Title": "Transmission Fee", "AccountClass": "EXPENSE", "GL_Code": "5139" },
  { "Title": "Transportation", "AccountClass": "EXPENSE", "GL_Code": "5140" },
  { "Title": "Travelling Expense", "AccountClass": "EXPENSE", "GL_Code": "5141" },
  { "Title": "Truck payment", "AccountClass": "EXPENSE", "GL_Code": "5142" },
  { "Title": "Truck Stop Fee", "AccountClass": "EXPENSE", "GL_Code": "5143" },
  { "Title": "Truck Wash", "AccountClass": "EXPENSE", "GL_Code": "5144" },
  { "Title": "Unemployment Benefits", "AccountClass": "EXPENSE", "GL_Code": "5145" },
  { "Title": "Uniforms", "AccountClass": "EXPENSE", "GL_Code": "5146" },
  { "Title": "Unloading Fee", "AccountClass": "EXPENSE", "GL_Code": "5147" },
  { "Title": "Utilities", "AccountClass": "EXPENSE", "GL_Code": "5148" },
  { "Title": "Wages", "AccountClass": "EXPENSE", "GL_Code": "5149" },
  { "Title": "Washing Service", "AccountClass": "EXPENSE", "GL_Code": "5150" },
  { "Title": "Water", "AccountClass": "EXPENSE", "GL_Code": "5151" },
  { "Title": "Website Services", "AccountClass": "EXPENSE", "GL_Code": "5152" }
];

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

function sanitizeText(text) {
  return text.replace(/[^a-zA-Z0-9\s.,$#\-_\/]/g, '');
}

/**
 * Builds the prompt with a dynamic GL Code List
 */
function buildPrompt(statementText, glCodes) {
  const glCodesJson = JSON.stringify(glCodes, null, 2);
  
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
        public string sourceDocumentFileName { get; set; }
    }

    public class Transaction
    {
        public string Date { get; set; }
        public string Description { get; set; }
        public string Amount { get; set; }
        public string DepositOrWithdrawal { get; set; }
        public string TransactionCategory { get; set; }
        public string TransactionGLCode { get; set; }
    }

    public Metadata metadata { get; set; }
    public Transaction[] transactions { get; set; }
    public int TotalExtractedTransactionsCount { get; set; }
    public decimal TotalExtractedDeposits { get; set; }
    public decimal TotalExtractedWithdrawals { get; set; }
    public bool IsThisACreditCardStatement { get; set; }
    public bool IsThisABankStatement { get; set; }
}

IMPORTANT NOTES:
- For each transaction, suggest a TransactionCategory.
- If Description is a Check, category is 'Check'.
- Suggest the best GL_Code from the GLCodeList provided below for 'TransactionGLCode'. 
- If no match, leave blank.
- Payments into Credit Cards are often transfers or negative values. Expenses are positive.

GLCodeList => 
${glCodesJson}

Please include no explanation or commentary. Just return the raw JSON string only.

--- Begin Statement Text ---
${statementText}
--- End Statement Text ---
`;
}

app.post('/processFiles', upload.array('files', 12), async (req, res) => {
  try {
    const files = req.files;
    
    // Parse glCodes from request body if provided.
    // Multer puts text fields in req.body.
    let customGLCodes = null;
    if (req.body.glCodes) {
        try {
            // Check if it's already an object (JSON middleware) or a string (multipart form)
            customGLCodes = typeof req.body.glCodes === 'string' 
                ? JSON.parse(req.body.glCodes) 
                : req.body.glCodes;
        } catch (e) {
            console.warn("⚠️ Failed to parse custom GL codes, falling back to default.");
        }
    }

    // Determine which list to use
    const glCodesToUse = (Array.isArray(customGLCodes) && customGLCodes.length > 0)
        ? customGLCodes
        : DEFAULT_GL_CODE_LIST;

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

    // Pass the selected GL codes to the prompt builder
    const prompt = buildPrompt(cleanText, glCodesToUse);
    console.log("🟡 Prompt length:", prompt.length);

    const chatCompletion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
      max_tokens: 15000
    });

    const resultText = chatCompletion.choices?.[0]?.message?.content;
    const finishReason = chatCompletion.choices?.[0]?.finish_reason;

    console.log("✅ Finish reason:", finishReason);

    try {
      const firstBrace = resultText.indexOf('{');
      const lastBrace = resultText.lastIndexOf('}');
      const jsonString = resultText.slice(firstBrace, lastBrace + 1);
      const parsed = JSON.parse(jsonString);

      return res.json({ success: true, result: parsed });
    } catch (parseErr) {
      console.error("❌ JSON parse failed:", parseErr.message);
      return res.status(500).json({
        success: false,
        error: "OpenAI response was not valid JSON.",
        raw: resultText
      });
    }
  } catch (error) {
    console.error("🔴 Server error:", JSON.stringify(error, null, 2));
    return res.status(500).json({
      success: false,
      error: typeof error === 'object' ? JSON.stringify(error, null, 2) : error.toString()
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});
