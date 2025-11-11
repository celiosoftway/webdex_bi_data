
const { Sequelize, Op } = require('sequelize');
const db = require('./database');
const { DailyData, PeriodConsolidatedByAccount } = db;
const { geraTxBd } = require('../fun/fun');

const {
    generateBIDATA,
    populateDailyData,
    populateDailyDataByAccount,
    generateBIDATAByAccount
} = require('../fun/bi');

async function getDailyData() {
    const daily = await DailyData.findAll({
        order: [['id', 'ASC']],
    });
    console.log(`Returned ${daily.length} daily records`);
    return daily;
}

async function getByConta() {
    const wallet = process.env.CARTEIRA_2 || 'default_wallet';

    const daily = await PeriodConsolidatedByAccount.findAll({
        where: { wallet, periodType: 'mensal' },
        order: [['id', 'ASC']],
    });
    console.log(`Returned ${daily.length} daily records`);

    return daily;
}


(async () => {
    const carteiras = [
        // { wallet: process.env.CARTEIRA_1, token: process.env.TOKEN_COLATERAL_ADDRESS_V4 },
        { wallet: process.env.CARTEIRA_2, token: process.env.TOKEN_COLATERAL_ADDRESS_V5 }
    ];


    for (const { wallet, token, version } of carteiras) {
        console.log(`🚀 Processando carteira ${wallet} - ${token}`);
        await geraTxBd(wallet, token);

        console.log(`🚀 Gerando dados do BI`);
        await generateBIDATA(wallet, token);
        await populateDailyData(wallet, token);
        await generateBIDATAByAccount(wallet, token);
        await populateDailyDataByAccount(wallet, token);
    }
})();
