
const { Sequelize, Op } = require('sequelize');
const db = require('./database');
const { PeriodConsolidated, DailyData } = db; 
const {geraTxBd,generateBIDATA,populateDailyData} = require('../fun/fun');

async function getDailyData() {
    const daily = await DailyData.findAll({
        order: [['id', 'ASC']],
    });
    console.log(`Returned ${daily.length} daily records`);
    return daily;
}

async function getDailyData() {
    const daily = await DailyData.findAll({
        order: [['id', 'ASC']],
    });
    console.log(`Returned ${daily.length} daily records`);
    return daily;
}



(async() => {
    await geraTxBd(process.env.CARTEIRA_1, process.env.TOKEN_COLATERAL_ADDRESS_V4);
    await generateBIDATA(process.env.CARTEIRA_1, process.env.TOKEN_COLATERAL_ADDRESS_V4);
    await populateDailyData(process.env.CARTEIRA_1, process.env.TOKEN_COLATERAL_ADDRESS_V4);

    // const{resultado: dados, lucro24h} = await  getHistoricoDados();
    // const resumo30 = getResumoPeriodo(dados, 30);
    // console.log(resumo30)
    // console.log(lucro24h)

    await getDailyData();
})()