// db.js - Separate file for database configuration and models

const { Sequelize, DataTypes } = require('sequelize');

// Configuração do Sequelize
const sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: './db/database.sqlite',
    logging: false,
});

// Definir modelos para o banco de dados
const Transaction = sequelize.define('Transaction', {
    carteira: { type: DataTypes.STRING },
    dataFormatada: { type: DataTypes.STRING },
    datasimples: { type: DataTypes.STRING },
    functionName: { type: DataTypes.STRING },
    strategy: { type: DataTypes.STRING },
    conta: { type: DataTypes.STRING },
    blockNumber: { type: DataTypes.INTEGER },
    timeStamp: { type: DataTypes.INTEGER },
    hash: { type: DataTypes.STRING, unique: true },
    from: { type: DataTypes.STRING },
    to: { type: DataTypes.STRING },
    value: { type: DataTypes.STRING },
    token: { type: DataTypes.STRING },
    tokenSymbol: { type: DataTypes.STRING },
    tokenDecimal: { type: DataTypes.INTEGER },
    isSaida: { type: DataTypes.BOOLEAN },
    valor: { type: DataTypes.FLOAT },
    gasUsed: { type: DataTypes.STRING },
    gasPrice: { type: DataTypes.STRING },
    totalWei: { type: DataTypes.STRING },
    gasValor: { type: DataTypes.FLOAT },
});

const BlockTracker = sequelize.define('BlockTracker', {
    id: { type: DataTypes.INTEGER, primaryKey: true, autoIncrement: true },
    lastBlock: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 }
},
    { tableName: 'block_tracker', timestamps: true }
);

// modelos para BI
const PeriodConsolidated = sequelize.define('PeriodConsolidated', {
    wallet: { type: DataTypes.STRING },
    periodType: { type: DataTypes.STRING },
    periodIdentifier: { type: DataTypes.STRING },
    startDate: { type: DataTypes.STRING },
    endDate: { type: DataTypes.STRING },
    addRem: { type: DataTypes.FLOAT },
    lucroDia: { type: DataTypes.FLOAT },
    lucroTotal: { type: DataTypes.FLOAT },
    capitalInicial: { type: DataTypes.FLOAT },
    capitalFinal: { type: DataTypes.FLOAT },
    percentual: { type: DataTypes.FLOAT },
    totalOperacoes: { type: DataTypes.INTEGER },
    totalLucroBruto: { type: DataTypes.FLOAT },
    totalPerdaBruta: { type: DataTypes.FLOAT },
}, {
    indexes: [
        { unique: true, fields: ['wallet', 'periodType', 'periodIdentifier'] }
    ]
});

const DailyData = sequelize.define('DailyData', {
    wallet: { type: DataTypes.STRING },
    data: { type: DataTypes.STRING }, // dd/mm/yyyy
    addRem: { type: DataTypes.FLOAT },
    lucroDia: { type: DataTypes.FLOAT },
    percentual: { type: DataTypes.FLOAT },
    operacoes: { type: DataTypes.INTEGER },
    lucroBruto: { type: DataTypes.FLOAT },
    perdaBruta: { type: DataTypes.FLOAT },
    lucroTotal: { type: DataTypes.FLOAT },
    capital: { type: DataTypes.FLOAT },
}, {
    indexes: [
        { unique: true,fields: ['wallet', 'data'] }
    ]
});

// Sincronizar modelos com o DB (executa ao importar o módulo)
(async () => {
    try {
        await sequelize.sync();
        console.log('Database synchronized successfully.');
    } catch (error) {
        console.error('Error synchronizing database:', error);
    }
})();

module.exports = {
    sequelize,
    Transaction,
    BlockTracker,
    PeriodConsolidated,
    DailyData
};