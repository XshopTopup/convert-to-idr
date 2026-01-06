
const express = require('express');
const axios = require('axios');
const cheerio = require('cheerio');
const UserAgent = require('user-agents');
const cors = require('cors');

const app = express();
app.use(cors());

class NizwarKurs {
    constructor() {
        // Menggunakan URL yang lebih langsung untuk menghindari redirect
        this.url = "https://www.bi.go.id/id/statistik/informasi-kurs/transaksi-bi/default.aspx";
        this.uaGenerator = new UserAgent({ deviceCategory: 'desktop' });
    }

    async fetchHTML() {
        try {
            const { data } = await axios.get(this.url, {
                headers: { 
                    'User-Agent': this.uaGenerator.toString(),
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
                    'Accept-Language': 'id-ID,id;q=0.9,en-US;q=0.8,en;q=0.7',
                    'Cache-Control': 'no-cache',
                    'Pragma': 'no-cache'
                },
                // Timeout dikurangi menjadi 8 detik agar fungsi tidak diputus paksa oleh Vercel
                timeout: 8000 
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
        
        // Memperbaiki selektor tabel untuk halaman informasi kurs terbaru
        $("table.table-responsive tr").each((i, el) => {
            const cells = $(el).find("td");
            if (cells.length >= 2) {
                const kode = $(cells[0]).text().trim().toLowerCase();
                const nama = $(cells[1]).text().trim();
                if (kode) arrKepanjangan[kode] = nama;
            }
        });

        // Alternatif jika dropdown kalkulator tidak tersedia, kita ambil dari tabel utama
        let results = [];
        $("table#ctl00_PlaceHolderMain_g_6c8944d1_cd54_4110_ba2b_46da7815d48d_ctl00_GridView1 tr").each((i, el) => {
            const cells = $(el).find("td");
            if (cells.length >= 4) {
                const kode = $(cells[0]).text().trim().toLowerCase();
                const jual = parseFloat($(cells[2]).text().replace(/,/g, ''));
                const beli = parseFloat($(cells[3]).text().replace(/,/g, ''));
                const tengah = (jual + beli) / 2;

                if (kode && !isNaN(tengah)) {
                    results.push({
                        kode: kode,
                        name: arrKepanjangan[kode] || kode.toUpperCase(),
                        val: tengah
                    });
                }
            }
        });

        // Jika tabel gridview tidak ditemukan, coba selektor fallback lainnya
        if (results.length === 0) {
            $(".table1 tr").each((i, el) => {
                const cells = $(el).find("td");
                if (cells.length >= 3) {
                    const kode = $(cells[0]).text().trim().toLowerCase();
                    const nilai = parseFloat($(cells[2]).text().replace(/,/g, ''));
                    if (kode && !isNaN(nilai)) {
                        results.push({
                            kode: kode,
                            name: arrKepanjangan[kode] || kode.toUpperCase(),
                            val: nilai
                        });
                    }
                }
            });
        }

        if (results.length === 0) throw new Error("Data kurs tidak ditemukan di halaman BI");
        return results;
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
        const targetKurs = kurs.toLowerCase().trim();
        const kursInfo = listKurs.find(item => item.kode === targetKurs);
        
        if (!kursInfo || isNaN(numericVal)) {
            return res.status(400).json({ 
                success: false, 
                message: "Mata uang tidak ditemukan atau input tidak valid" 
            });
        }

        const result = (kursInfo.val * numericVal);
        res.json({
            success: true,
            kurs: kursInfo,
            result: parseFloat(result.toFixed(2))
        });
    } catch (error) {
        res.status(500).json({ 
            success: false, 
            message: "Gagal mengambil data dari Bank Indonesia (Timeout). Silakan coba lagi." 
        });
    }
});

module.exports = app;
