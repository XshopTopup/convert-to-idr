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
            const { data } = await axios.get(this.url, {
                headers: { 'User-Agent': this.uaGenerator.toString() },
                timeout: 10000
            });
            return cheerio.load(data);
        } catch (error) {
            throw new Error(`Gagal akses BI: ${error.message}`);
        }
    }

    async getListOfKurs() {
        const $ = await this.fetchHTML();
        const arrKepanjangan = {};
        
        $("#KodeSingkatan .table1 tr").slice(1).each((_, el) => {
            const cells = $(el).find("td");
            const kode = $(cells[0]).text().trim().toLowerCase();
            const nama = $(cells[1]).text().trim();
            if (kode) arrKepanjangan[kode] = nama;
        });

        return $("#ctl00_PlaceHolderMain_biWebKalkulatorKurs_ddlmatauang1 option")
            .toArray()
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
            .filter(item => item !== null);
    }
}

app.get('/api/convert', async (req, res) => {
    const { val, kurs } = req.query;
    const service = new NizwarKurs();

    try {
        const listKurs = await service.getListOfKurs();
        if (!val || !kurs) return res.json({ success: true, data: listKurs });

        const numericVal = parseFloat(val.toString().replace(',', '.'));
        const kursInfo = listKurs.find(item => item.kode === kurs.toLowerCase().trim());
        
        if (!kursInfo || isNaN(numericVal)) {
            return res.status(400).json({ success: false, message: "Input tidak valid" });
        }

        const result = (kursInfo.val * numericVal).toFixed(2);
        res.json({ success: true, kurs: kursInfo, result: parseFloat(result) });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = app;
