const { GoogleGenerativeAI } = require("@google/generative-ai");
const axios = require('axios');

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * Analyzes an image (photo) from Telegram and extracts attendance data
 * @param {string} fileUrl - The direct URL to the photo
 */
async function analyzeAttendancePhoto(fileUrl) {
    try {
        // 1. Download image as Buffer
        const response = await axios.get(fileUrl, { responseType: 'arraybuffer' });
        const BufferData = Buffer.from(response.data);

        // 2. Prepare for Gemini
        const imagePart = {
            inlineData: {
                data: BufferData.toString("base64"),
                mimeType: "image/png" // Telegram photos are usually JPG/PNG
            }
        };

        const prompt = `Ushbu davomat varaqasidagi yoki qo'lda yozilgan hisobotdagi raqamlarni aniqlab ber. 
        Menga quyidagi ma'lumotlar kerak:
        1. Jami o'quvchilar soni (Total students)
        2. Kasalligi tufayli kelmaganlar (Sick)
        3. Boshqa sababli kelmaganlar (Oila, tadbir, ijtimoiy jami)
        4. Sababsiz kelmaganlar (Absent/Unjustified)
        5. MMIBDO' yoki mas'ul shaxs ismi (FIO)

        Javobni faqat va faqat quyidagi JSON formatida qaytar (hech qanday qo'shimcha matnsiz):
        {
            "total_students": number,
            "sababli_kasal": number,
            "sababli_jami_others": number,
            "sababsiz_jami": number,
            "fio": "string or null"
        }
        
        Agar biror raqamni aniqlab bo'lmasa, u yerga null qo'y.`;

        // 3. Generate content
        const result = await model.generateContent([prompt, imagePart]);
        const text = result.response.text();

        // 4. Extract JSON from response (sometimes Gemini wraps it in ```json)
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
            return JSON.parse(jsonMatch[0]);
        }

        throw new Error("JSON topilmadi: " + text);

    } catch (e) {
        console.error("Gemini AI Error:", e.message);
        return null;
    }
}

module.exports = { analyzeAttendancePhoto };
