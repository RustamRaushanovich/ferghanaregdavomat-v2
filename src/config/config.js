require('dotenv').config();

module.exports = {
    BOT_TOKEN: process.env.BOT_TOKEN || '8421014179:AAFrDHsgueHljJuj1Lx5m_JG5wzVPbVAyeE',
    GOOGLE_SCRIPT_URL: process.env.GOOGLE_SCRIPT_URL,
    REPORT_GROUP_ID: process.env.REPORT_GROUP_ID || '-1003662758005',
    SUPER_ADMIN_IDS: [65002404, 786314811, 5310405293],
    SPECIALIST_IDS: [5310405293],
    RESTRICTED_IDS: [
        5807811746, 922449047, 5547706955, 8544693602, 1969769846, 341362677, 6229419604, 595501640,
        503222829, 8145453879, 1894911241, 6822495768, 271593039, 583173715, 345359050,
        1130890451, 309212107, 104416763, 7862384262
    ],
    DISTRICT_ADMINS: {
        5807811746: "Dang‘ara tumani",
        922449047: "Beshariq tumani",
        5547706955: "Buvayda tumani",
        8544693602: "So‘x tumani",
        1969769846: "Rishton tumani",
        341362677: "Yozyovon tumani",
        6229419604: "Oltiariq tumani",
        595501640: "Toshloq tumani",
        503222829: "Qo‘shtepa tumani",
        8145453879: "Bag‘dod tumani",
        1894911241: "Furqat tumani",
        6822495768: "Marg‘ilon shahri",
        271593039: "O‘zbekiston tumani",
        583173715: "Quvasoy shahri",
        345359050: "Farg‘ona shahri",
        1130890451: "Qo‘qon shahri",
        309212107: "Quva tumani",
        104416763: "Farg‘ona tumani",
        7862384262: "Uchko‘prik tumani"
    },
    DISTRICT_HEADS: {
        "Farg‘ona shahri": { name: "Teshaboev Boburjon Baxodir o‘g‘li", phone: "911074419" },
        "Marg‘ilon shahri": { name: "Qodirov Abdullajon XXX", phone: "907608766" },
        "Qo‘qon shahri": { name: "Alieva Laziza Xusanovna", phone: "991552363" },
        "Quvasoy shahri": { name: "Qurbonov Ulug‘bek Jumaevich", phone: "933738101" },
        "Beshariq tumani": { name: "Po‘latov Dilshodjon Kaxxolrovich", phone: "936400503" },
        "Bag‘dod tumani": { name: "Isaboeva Elmira Erkinovna", phone: "+998916910074" },
        "Uchko‘prik tumani": { name: "Yunusova Marg‘uba Akramovna", phone: "911559402" },
        "Qo‘shtepa tumani": { name: "Ergasheva Mamlakatxon Muxtorovna", phone: "90-580-07-32" },
        "Farg‘ona tumani": { name: "Raximova Maxliyoxon Xolmuxammadovna", phone: "901798484" },
        "O‘zbekiston tumani": { name: "Ochildieva Gulmiraxon Ne'matillaevna", phone: "(+99891) 147-08-01" },
        "Dang‘ara tumani": { name: "Miraminov Abdulaziz G‘ayratjon o‘g‘li", phone: "+99894-608-17-08" },
        "Rishton tumani": { name: "Raximov Abdumutal Abduxalim o‘g‘li", phone: "90-838-62-74" },
        "So‘x tumani": { name: "Ibragimov Gulshan Ravshanjonovich", phone: "95-992-90-00" },
        "Toshloq tumani": { name: "Sultonov Ramziddin", phone: "+998907823238" },
        "Oltiariq tumani": { name: "Shodiev Oybek Tolibjonovich", phone: "+998912841171" },
        "Furqat tumani": { name: "Mirzaev Mirzaxamdamjon Valievich", phone: "99-510-00-79" },
        "Buvayda tumani": { name: "Axmadjonov Aliyorbek Azizbekovich", phone: "944440405" },
        "Quva tumani": { name: "Xolikov Jaxongir Ne'matjonovich", phone: "+998911101011" },
        "Yozyovon tumani": { name: "Usmonov Shoxrux Rustamjonovich", phone: "91-112-74-95" }
    },
    get ALL_ADMINS() {
        return [...this.SUPER_ADMIN_IDS, ...this.SPECIALIST_IDS, ...this.RESTRICTED_IDS];
    }
};
