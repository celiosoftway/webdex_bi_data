// npm install axios ethers sequelize sqlite sqlite3

require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');

const RPC_GLOBAL = process.env.RPC_GLOBAL;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(RPC_GLOBAL);

const { formatarDataSimples, formatarData, ABI_DECODE_TX, ERC20_MIN_ABI } = require("../fun/util");

const db = require('../db/database');
const { sequelize, Transaction, BlockTracker, PeriodConsolidated, DailyData } = db;

// Função para buscar transações novas via API
async function getTransactionsAPI(carteira, token, apiKey, blocoini) {
    console.log("⚙️ Executando getTransactionsAPI");

    const { blocoProcessado, blocoAtual } = await getBlock(carteira, token);

    try {
        const params = new URLSearchParams({
            chainid: '137',
            module: 'account',
            action: 'tokentx',
            address: carteira,
            contractaddress: token,
            sort: 'asc',
            apikey: apiKey,
            startblock: blocoProcessado || blocoini || 0,
        });

        const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
        const response = await axios.get(url);
        const data = response.data;

        if (!data.result || !Array.isArray(data.result)) {
            throw new Error("Erro ao obter transações.");
        }

        return data.result;

    } catch (error) {
        console.error("Erro em getTransactionsAPI:", error);
        return [];
    }
}

// Função para formatar e salvar transações no DB
async function geraTxBd(carteira, colateral) {
    console.log("⚙️ Executando formataTx");
    const resultado = [];
    const { blocoProcessado, blocoAtual } = await getBlock(carteira, colateral);

    try {
        const txs = await getTransactionsAPI(carteira, colateral, POLYGONSCAN_API_KEY);

        for (const tx of txs) {
            // Verificar se a transação já existe no DB (evitar duplicatas)
            const existingTx = await Transaction.findOne({ where: { hash: tx.hash } });
            if (existingTx) continue;

            const dataFormatada = formatarData(tx.timeStamp);
            const datasimples = formatarDataSimples(tx.timeStamp);

            const dadosTx = await decodeTransactionInput(tx.hash, provider);
            const functionName = dadosTx?.functionName || "unknown";
            const strategy = dadosTx?.args?.strategyToken || 'unknown';
            const conta = dadosTx?.args?.accountId?.[0] || 'unknown'; // Assumindo array, pegando o primeiro

            const blockNumber = tx.blockNumber;
            const timeStamp = tx.timeStamp;
            const hash = tx.hash;
            const from = tx.from;
            const to = tx.to;
            const value = tx.value;
            const tokenSymbol = tx.tokenSymbol;
            const tokenDecimal = tx.tokenDecimal;

            const isSaida = tx.from.toLowerCase() === carteira.toLowerCase();
            const valor = parseFloat(ethers.formatUnits(tx.value, 6)) * (isSaida ? -1 : 1);

            const gasUsed = BigInt(tx.gasUsed);
            const gasPrice = BigInt(tx.gasPrice);
            const totalWei = gasUsed * gasPrice;
            const gasValor = Number(ethers.formatEther(totalWei)).toFixed(5);

            const token = colateral;

            const txData = {
                carteira,
                dataFormatada,
                datasimples,
                functionName,
                strategy,
                conta,
                blockNumber,
                timeStamp,
                hash,
                from,
                to,
                value,
                token,
                tokenSymbol,
                tokenDecimal,
                isSaida,
                valor,
                gasUsed: gasUsed.toString(),
                gasPrice: gasPrice.toString(),
                totalWei: totalWei.toString(),
                gasValor,
            };

            try {
                await Transaction.create(txData);
            } catch (error) {
                console.error(error);
            }

            resultado.push(txData);
        }

        try {
            await setLastProcessedBlock(blocoAtual - 1, carteira, colateral);
        } catch (error) {
            console.error(error);
        }

        return resultado;
    } catch (error) {
        console.error("Erro em formataTx:", error);
        return [];
    }
}

// Função que busca e decodifica input data
async function decodeTransactionInput(txHash, provider1) {
    console.log("⚙️ Executando decodeTransactionInput");

    try {
        const tx = await provider.getTransaction(txHash);

        if (!tx) throw new Error(`Transação ${txHash} não encontrada`);

        const iface = new ethers.Interface(ABI_DECODE_TX);
        const decoded = iface.parseTransaction({ data: tx.data, value: tx.value });
        if (!decoded) throw new Error("Método não encontrado na ABI");

        if (decoded.name === "LiquidityAdd" || decoded.name === "LiquidityRemove") {
            const rawAccount = decoded.args[0];
            const accountIdArray = Array.isArray(rawAccount) ? rawAccount : [rawAccount];

            return {
                functionName: decoded.name,
                args: {
                    accountId: accountIdArray,
                    strategyToken: decoded.args[1],
                    coin: decoded.args[2],
                    amount: decoded.args[3]?.toString?.() || null,
                },
            };
        }

        if (decoded.name === "openPosition") {
            const rawAccount = decoded.args[1];
            const accountIdArray = Array.isArray(rawAccount) ? rawAccount : [rawAccount];

            return {
                functionName: decoded.name,
                args: {
                    contractAddress: decoded.args[0],
                    accountId: accountIdArray,
                    strategyToken: decoded.args[2],
                    user: decoded.args[3],
                    amount: decoded.args[4]?.toString?.() || null,
                    pairs: decoded.args[5],
                    leverage: decoded.args[6]?.toString?.() || null,
                    referrer: decoded.args[7],
                },
            };
        }

        return {
            functionName: decoded.name,
            args: decoded.args,
        };
    } catch (error) {
        const methodId = ""; //(tx?.data || "").slice(0, 10);
        console.warn(`Erro ao decodificar input: ${txHash} ${error.message} (${methodId} )`);
        return { functionName: "unknown", args: {}, methodId };
    }
}

// blocos
// blocoAtual salva no banco
// blocoProcessado, usa como parametro inicial no get
async function getBlock(carteira, token, start) {
    const blocoAtual = await getCurrentBlockFromRPC(RPC_GLOBAL);

    if (!blocoAtual) {
        console.error(`⛔ Não foi possível obter o bloco atual para `);
    }

    let blocoProcessado = await getLastProcessedBlock(carteira, token);
    if (!blocoProcessado || blocoProcessado === 0 || start) {
        console.log(`\n⛔ Não foi possível obter o ultimo bloco registrado do usuario`);
        blocoProcessado = 0;
    }

    return { blocoProcessado: blocoProcessado, blocoAtual: blocoAtual }
}


async function getCurrentBlockFromRPC(rpc) {
    //const provider = new ethers.JsonRpcProvider(rpc);
    const blockNumber = await provider.getBlockNumber();

    console.log(`Bloco atual ${blockNumber}`);
    return blockNumber;
}

// Função para obter o último bloco processado do DB
async function getLastProcessedBlock(carteira, token) {
    const lastTx = await Transaction.findOne({
        where: {
            carteira: carteira,
            token: token,
        },
        order: [['blockNumber', 'DESC']],
    });

    const result = lastTx ? lastTx.blockNumber : 0;
    console.log(`Último bloco salvo para ${carteira} (${token}): ${result}`);
    return result;
}

// retorna transações do banco
async function getAllTransactions(carteira, token) {
    try {
        const transactions = await Transaction.findAll({
            where: { carteira, token },
            order: [['timeStamp', 'ASC']],
            raw: true
        });

        return transactions;
    } catch (error) {
        console.error('Erro ao buscar transações:', error);
        throw error;
    }
}

async function setLastProcessedBlock(blockNumber, carteira, token) {
    await BlockTracker.upsert({ carteira, token, lastBlock: blockNumber });
}


async function getHistoricoDados(carteira, token, conta = null) {
    try {
        // Busca transações do BD já filtradas por carteira e token
        const transactions = await getAllTransactions(carteira, token);

        // console.log(transactions)

        // filtra por conta se for passado o paramêtro.
        const filtradas = conta
            ? transactions.filter(tx => tx.conta === conta)
            : transactions;

        if (!transactions || !Array.isArray(transactions)) {
            throw new Error("Erro ao obter transações do banco.");
        }

        const data = filtradas; // É o array diretamente!
        //const data = transactions.transactions; 

        if (data.length === 0) {
            return { resultado: [], lucro24h: { valor: 0, percentual: 0, totalOperacoes: 0, totalLucroBruto: 0, totalPerdaBruta: 0 } };
        }

        // --- agrega por DIA, já contando operações e separando ganhos/perdas (OpenPosition)
        const resumoPorDia = {};
        for (const tx of data) {
            const tipo = tx.functionName;
            if (tipo === 'Desconhecido') continue;

            const dataChave = tx.datasimples; // Já vem formatada do BD
            const valor = tx.valor; // Já vem calculado e formatado do BD

            if (!resumoPorDia[dataChave]) {
                resumoPorDia[dataChave] = {
                    LiquidityAdd: 0,
                    LiquidityRemove: 0,
                    openPosition: 0,
                    opCount: 0,
                    lucroBruto: 0,
                    perdaBruta: 0
                };
            }

            resumoPorDia[dataChave][tipo] += valor;
            if (tipo === 'openPosition') {
                resumoPorDia[dataChave].opCount += 1;
                if (valor >= 0) resumoPorDia[dataChave].lucroBruto += valor;
                else resumoPorDia[dataChave].perdaBruta += Math.abs(valor);
            }
        }

        const datas = Object.keys(resumoPorDia).sort((a, b) => {
            const [d1, m1, y1] = a.split('/').map(Number);
            const [d2, m2, y2] = b.split('/').map(Number);
            return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
        });

        let capital = 0;
        let capitaldia1 = 0;
        let lucroTotal = 0;
        const resultado = [];

        // 🔹 obter o primeiro capital inicial
        if (datas.length > 0) {
            const primeiraData = datas[0];
            const d0 = resumoPorDia[primeiraData];
            if (d0.LiquidityAdd > 0) {
                capitaldia1 = d0.LiquidityAdd;
            }
        }

        for (const dataKey of datas) {
            const d = resumoPorDia[dataKey];
            const investimento = d.LiquidityAdd + d.LiquidityRemove;
            const lucro = d.openPosition;
            const capitalInicialDia = capital > 0 ? capital : capitaldia1;

            capital += investimento + lucro;
            lucroTotal += lucro;

            const transacoesDoDia = data.filter(tx => tx.datasimples === dataKey);
            const percentualPonderado = calculaPPT(transacoesDoDia, capitalInicialDia);

            resultado.push({
                data: dataKey,
                addRem: investimento,
                capital,
                lucroDia: lucro,
                lucroTotal,
                percentual: percentualPonderado,
                operacoes: d.opCount,
                lucroBruto: d.lucroBruto,
                perdaBruta: d.perdaBruta
            });
        }

        // ---- Lucro últimas 24h
        const agora = Math.floor(Date.now() / 1000);
        const limite24h = agora - 24 * 60 * 60;

        const ultimas24hOps = data
            .filter(op =>
                op.functionName === "openPosition" &&
                op.timeStamp >= limite24h
            )
            .map(op => ({ valor: op.valor }));

        const lucro24hValor = ultimas24hOps.reduce((acc, op) => acc + op.valor, 0);
        const totalOperacoes24h = ultimas24hOps.length;
        const totalLucroBruto24h = ultimas24hOps.filter(op => op.valor >= 0).reduce((acc, op) => acc + op.valor, 0);
        const totalPerdaBruta24h = ultimas24hOps.filter(op => op.valor < 0).reduce((acc, op) => acc + Math.abs(op.valor), 0);

        let capitalAntes24h = 0;
        for (let i = resultado.length - 1; i >= 0; i--) {
            const dataItem = new Date(resultado[i].data.split('/').reverse().join('-'));
            if (dataItem.getTime() / 1000 < limite24h) {
                capitalAntes24h = resultado[i].capital;
                break;
            }
        }
        if (capitalAntes24h === 0 && resultado.length > 0) {
            capitalAntes24h = resultado[resultado.length - 1].capital;
        }

        const lucro24hPercent = capitalAntes24h > 0 ? (lucro24hValor / capitalAntes24h) * 100 : 0;

        const lucro24h = {
            valor: lucro24hValor,
            percentual: lucro24hPercent,
            totalOperacoes: totalOperacoes24h,
            totalLucroBruto: totalLucroBruto24h,
            totalPerdaBruta: totalPerdaBruta24h
        };

        return { resultado, lucro24h };

    } catch (error) {
        console.error('Erro em getHistoricoDados:', error);
        throw error;
    }
}

// tokenDecimals: 6 para USDT/LPUSDT (ajuste se precisar)
function calculaPPT(transacoesDia = [], capitalInicialDia = 0) {
    const signerAddress = process.env.CARTEIRA;
    const tokenDecimals = 6;

    if (!Array.isArray(transacoesDia) || transacoesDia.length === 0) {
        return { percentual: 0, capitalMedio: Number(capitalInicialDia || 0), lucroDia: 0 };
    }

    // garantir ordenação por timestamp (em segundos)
    const txs = [...transacoesDia].sort((a, b) => Number(a.timeStamp) - Number(b.timeStamp));

    // início do dia (em segundos) baseado no timestamp do primeiro tx
    const firstTsMs = new Date(Number(txs[0].timeStamp) * 1000).setHours(0, 0, 0, 0);
    const dayStartSec = Math.floor(firstTsMs / 1000);
    const dayEndSec = dayStartSec + 24 * 3600;

    let capital = Number(capitalInicialDia || 0);
    let somaPonderada = 0; // capital * segundos
    let tempoTotal = 0;    // em segundos
    let ultimoTs = dayStartSec; // começa no início do dia

    const valorTx = (tx) => {
        // converte para unidades humanas (ex: USDT com 6 decimais)
        let v = 0;
        try {
            v = Number(ethers.formatUnits(tx.value, tokenDecimals));
        } catch (e) {
            // fallback if needed
            v = Number(tx.value) || 0;
        }
        const isSaida = tx.from && tx.from.toLowerCase() === signerAddress.toLowerCase();
        return isSaida ? -v : v;
    };

    for (const tx of txs) {
        const ts = Number(tx.timeStamp); // segundos
        const delta = Math.max(0, ts - ultimoTs);
        if (delta > 0) {
            somaPonderada += capital * delta;
            tempoTotal += delta;
        }

        // aplica mudança de capital usando o valor convertido (com sinal)
        const tipo = tx.functionName;
        const v = tx.valor; // já com sinal

        if (tipo === "LiquidityAdd" || tipo === "LiquidityRemove" || tipo === "openPosition") {
            capital += v;
        } else {
            // outros tipos: ignorar ou tratar conforme necessário
        }

        ultimoTs = ts;
    }

    const deltaFinal = Math.max(0, dayEndSec - ultimoTs);
    if (deltaFinal > 0) {
        somaPonderada += capital * deltaFinal;
        tempoTotal += deltaFinal;
    }

    const capitalMedio = tempoTotal > 0 ? (somaPonderada / tempoTotal) : Number(capitalInicialDia || 0);

    const lucroDia = txs
        .filter(tx => tx.functionName === "openPosition")
        .reduce((acc, tx) => acc + tx.valor, 0);

    const percentual = capitalMedio > 0 ? (lucroDia / capitalMedio) * 100 : 0;

    return percentual;
}

function getResumoPeriodo(dados, dias = 7, incluirHoje = false) {
    const ordenarPorData = (a, b) => {
        const [d1, m1, y1] = a.data.split('/').map(Number);
        const [d2, m2, y2] = b.data.split('/').map(Number);
        return new Date(y1, m1 - 1, d1) - new Date(y2, m2 - 1, d2);
    };

    const todos = [...dados].sort(ordenarPorData);

    const hoje = new Date();
    const hojeBase = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate());

    let inicio, fim;

    if (dias === 0) {
        // 🔹 apenas dia atual
        inicio = hojeBase;
        fim = hoje;
    } else {
        // 🔹 períodos fechados
        fim = new Date(hojeBase);
        if (!incluirHoje) fim.setDate(fim.getDate() - 1); // termina ontem se não incluir hoje
        inicio = new Date(fim.getFullYear(), fim.getMonth(), fim.getDate() - (dias - 1));
    }

    const filtrados = todos.filter(item => {
        const [dia, mes, ano] = item.data.split('/').map(Number);
        const dataItem = new Date(ano, mes - 1, dia);
        return dataItem >= inicio && dataItem <= fim;
    });

    //if (filtrados.length === 0) return null;

    if (filtrados.length === 0) {
        return {
            periodo:
                dias === 0
                    ? "Dia atual"
                    : incluirHoje
                        ? `Últimos ${dias} dias (inclui hoje)`
                        : `Últimos ${dias} dias fechados`,
            addRem: 0,
            lucroDia: 0,
            lucroTotal: 0,
            capitalInicial: 0,
            capitalFinal: 0,
            percentual: 0,
            totalOperacoes: 0,
            totalLucroBruto: 0,
            totalPerdaBruta: 0
        };
    }

    // agregados do período
    const addRem = filtrados.reduce((acc, x) => acc + x.addRem, 0);
    const lucroDia = filtrados.reduce((acc, x) => acc + x.lucroDia, 0);
    const percentual = (filtrados.reduce((acc, x) => acc * (1 + (x.percentual || 0) / 100), 1) - 1) * 100;

    const totalOperacoes = filtrados.reduce((acc, x) => acc + (x.operacoes || 0), 0);
    const totalLucroBruto = filtrados.reduce((acc, x) => acc + (x.lucroBruto || 0), 0);
    const totalPerdaBruta = filtrados.reduce((acc, x) => acc + (x.perdaBruta || 0), 0);

    const primeiroDia = filtrados[0];
    const ultimoDia = filtrados[filtrados.length - 1];

    const idxPrimeiro = todos.findIndex(x => x.data === primeiroDia.data);
    const lucroAcumuladoAntes = idxPrimeiro > 0 ? todos[idxPrimeiro - 1].lucroTotal : 0;
    const lucroTotalPeriodo = ultimoDia.lucroTotal - lucroAcumuladoAntes;

    const capitalInicial = primeiroDia.capital;
    const capitalFinal = ultimoDia.capital || capitalInicial + lucroTotalPeriodo + addRem;

    return {
        periodo:
            dias === 0
                ? "Dia atual"
                : incluirHoje
                    ? `Últimos ${dias} dias (inclui hoje)`
                    : `Últimos ${dias} dias fechados`,
        addRem,
        lucroDia,
        lucroTotal: lucroTotalPeriodo,
        capitalInicial,
        capitalFinal,
        percentual,
        totalOperacoes,
        totalLucroBruto,
        totalPerdaBruta
    };
}


module.exports = {
    geraTxBd,
    decodeTransactionInput,
    getHistoricoDados,
    getAllTransactions
};