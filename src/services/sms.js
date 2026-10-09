const axios = require('axios');
require('dotenv').config();

/**
 * SMS Service for Eskiz.uz integration
 */
const SmsService = {
    token: null,
    token_expire: null,

    async login() {
        try {
            const res = await axios.post('https://notify.eskiz.uz/api/auth/login', {
                email: process.env.ESKIZ_EMAIL,
                password: process.env.ESKIZ_PASSWORD
            });
            this.token = res.data.data.token;
            // Token usually expires in 30 days
            return this.token;
        } catch (e) {
            console.error("SMS Login Error:", e.response ? e.response.data : e.message);
            return null;
        }
    },

    async getToken() {
        if (!this.token) {
            return await this.login();
        }
        return this.token;
    },

    /**
     * Send SMS to a single number
     */
    async sendSms(phone, message) {
        if (!process.env.ESKIZ_EMAIL || !process.env.ESKIZ_PASSWORD) {
            console.log("SMS Service not configured. Simulated message to", phone, ":", message);
            return true;
        }

        try {
            const token = await this.getToken();
            const cleanPhone = phone.replace(/\D/g, '');

            const res = await axios.post('https://notify.eskiz.uz/api/message/sms/send', {
                mobile_phone: cleanPhone,
                message: message,
                from: '4546' // Default Eskiz sender ID
            }, {
                headers: { 'Authorization': `Bearer ${token}` }
            });

            return res.data;
        } catch (e) {
            console.error("SMS Send Error:", e.response ? e.response.data : e.message);
            // If token expired, retry once
            if (e.response && e.response.status === 401) {
                this.token = null;
                return this.sendSms(phone, message);
            }
            return null;
        }
    },

    /**
     * Format the attendance warning message
     */
    formatMessage(data) {
        return `Assalomu alaykum hurmatli ota-ona! Sizning farzandingiz ${data.tuman}, ${data.maktab}ning ${data.sinf} o'quvchisi ${data.fish} bugun maktabga kelmaganligini ma'lum qilamiz.\n\nMa'lumot uchun, farzandingizni ta'limiga e'tiborsizligingiz O'zbekiston Respublikasining Ma'muriy javobgarlik to'g'risidagi kodeksning 47-moddasi asosida jarimaga tortilishingizga sabab bo'lishini ogohlantiramiz.`;
    }
};

module.exports = SmsService;
