const { GoogleGenerativeAI } = require("@google/generative-ai");
require('dotenv').config();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

/**
 * MMIBDO ishlarini tahlil qilish va baholash (AI)
 * @param {string} prompt - Kriteriya bo'yicha yo'riqnoma
 * @param {string} text - Foydalanuvchi kiritgan matn
 * @param {string} filePath - (Ixtiyoriy) Yuklangan rasm yoki PDF manzili
 */
async function analyzeMMIBDOWork(type, text, filePath = null) {
    try {
        let prompt = "";
        
        if (type === 'tadbirlar') {
            prompt = `Siz Maktab Ma'naviy-ma'rifiy ishlar bo'yicha ekspertsiz. 
            O'tkazilgan tadbir haqidagi ushbu hisobotni tahlil qiling va 100 ballik tizimda baholang.
            
            Mezonlar:
            1. Sifat va mazmun (Tadbirning maqsadi va natijasi aniqmi?) - 40 ball
            2. Haqiqiylik (Bu haqiqiy maktab tadbirimi yoki shablonmi?) - 30 ball
            3. Kreativlik va yondashuv - 30 ball
            
            Foydalanuvchi kiritgan matn: "${text}"
            
            Javobni FAQAT quyidagi JSON formatida qaytaring:
            {
                "score": 0-100 oraliqda raqam,
                "feedback": "O'zbek tilida qisqacha izoh (maksimum 2 ta jumlada)",
                "strengths": "Yutuqlari haqida",
                "weaknesses": "Kamchiliklari (agar bo'lsa)"
            }`;
        } else if (type === 'hujjatlar') {
            prompt = `Siz ta'lim sohasidagi inspektorsiz. Ushbu hujjat sarlavhasi/mazmunini tahlil qiling: "${text}".
            Ushbu hujjat buyruq talablariga qanchalik mos keladi? 100 ballik tizimda baholang.
            
            Javobni JSON formatida qaytaring:
            { "score": 0-100, "feedback": "...izoh...", "strengths": "...", "weaknesses": "..." }`;
        } else {
            prompt = `Ushbu pedagogik profilaktika ishlari hisobotini baholang: "${text}".
            JSON qaytaring: { "score": 0-100, "feedback": "...", "strengths": "...", "weaknesses": "..." }`;
        }

        const result = await model.generateContent(prompt);
        const response = await result.response;
        let resultText = response.text();
        
        // JSONni tozalash (ba'zida AI markdown blocklari bilan qaytaradi)
        resultText = resultText.replace(/```json|```/g, "").trim();
        
        return JSON.parse(resultText);
    } catch (e) {
        console.error("AI Analysis Error:", e);
        return { score: 0, feedback: "AI tahlilida xatolik yuz berdi.", strengths: "", weaknesses: "" };
    }
}

module.exports = { analyzeMMIBDOWork };
