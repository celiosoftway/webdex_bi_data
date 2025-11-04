
const { Sequelize, Op } = require('sequelize');
const db = require('./database');
const { PeriodConsolidated, DailyData } = db; 
const {geraTxBd,generateBIDATA,populateDailyData,decodeTransactionInput} = require('../fun/fun');

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

    await geraTxBd(process.env.CARTEIRA_2, process.env.TOKEN_COLATERAL_ADDRESS_V5);
    await generateBIDATA(process.env.CARTEIRA_2, process.env.TOKEN_COLATERAL_ADDRESS_V5);
    await populateDailyData(process.env.CARTEIRA_2, process.env.TOKEN_COLATERAL_ADDRESS_V5);

    //await getDailyData();

    //const tx1 = '0x80fbc656d13908b70fd3c0eec24340557aef15a0f05d2ed1d254c22db0ce5312';
    //const tx2 = '0x49bba2eaa8a5a352a59462b95e8ce7cd4e87eae511d08ecd63ec06d87fc5cc4e';
    
    //const result = await decodeTransactionInput(tx1)
    //console.log(result)
})()