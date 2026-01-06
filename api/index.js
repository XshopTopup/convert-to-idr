const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');
const cors = require('cors');

const app = express();
app.use(cors());

class NizwarKurs {
    constructor() {
        this.url = "https://www.bi.go.id/id/moneter/kalkulator-kurs/Default.aspx";
        this.uaGenerator = new UserAgent({ deviceCategory: 'desktop' });
    }

    async fetchHTML() {
        try {
            // Menaikkan timeout dan menambahkan header yang lebih lengkap
            const { data } = await axios.get(this.url, {
                headers: { 
                    'User-Agent': this.uaGenerator.toString(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id,en-US;q=0.7,en;q=0.3',
                },
                timeout: 8000 // Batasi 8 detik agar tidak melewati limit Vercel (10 detik)
            });
            return cheerio.load(data);
        } catch (error) {
            console.error("Scraping Error:", error.message);
            throw error;
        }
    }

    async getListOfKurs() {
        const $ = await this.fetchHTML();
        const arrKepanjangan = {};
        
        // Mempercepat selector
        $("#KodeSingkatan .table1 tr").each((i, el) => {
            if (i === 0) return;
            const cells = $(el).find("td");
            const kode = $(cells[0]).text().trim().toLowerCase();
            const nama = $(cells[1]).text().trim();
            if (kode) arrKepanjangan[kode] = nama;
        });

        const options = $("#ctl00_PlaceHolderMain_biWebKalkulatorKurs_ddlmatauang1 option");
        if (!options.length) throw new Error("Data tidak ditemukan di situs BI");

        return options.toArray()
            .map(el => {
                const val = $(el).val();
                if (!val || !val.includes(".:.")) return null;
                const [satuan, nilai, kode] = val.toLowerCase().split(".:.").map(s => s.trim());
                return {
                    kode: kode,
                    name: arrKepanjangan[kode] || "Mata Uang Asing",
                    val: parseFloat(nilai) / parseFloat(satuan)
                };
            })
            .filter(Boolean);
    }
}

app.get('/api/convert', async (req, res) => {
    const { val, kurs } = req.query;
    const service = new NizwarKurs();

    try {
        const listKurs = await service.getListOfKurs();

        if (!val || !kurs) {
            return res.json({ success: true, data: listKurs });
        }

        const numericVal = parseFloat(val.toString().replace(',', '.'));
        const kursInfo = listKurs.find(item => item.kode === kurs.toLowerCase().trim());
        
        if (!kursInfo || isNaN(numericVal)) {
            return res.status(400).json({ success: false, message: "Parameter tidak valid" });
        }

        const result = (kursInfo.val * numericVal).toFixed(2);
        res.json({ success: true, kurs: kursInfo, result: parseFloat(result) });
    } catch (error) {
        // Mengirimkan pesan error yang lebih jelas ke frontend
        res.status(500).json({ 
            success: false, 
            message: "Gagal mengambil data dari BI. Silakan coba lagi nanti." 
        });
    }
});

module.exports = app;
