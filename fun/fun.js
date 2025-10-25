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

    const { blocoProcessado, blocoAtual } = await getBlock();

    try {
        const params = new URLSearchParams({
            chainid: '137',
            module: 'account',
            action: 'tokentx',
            address: carteira,
            contractaddress: token,
            sort: 'asc',
            apikey: apiKey,
            startblock: blocoProcessado || 0,
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
    const { blocoProcessado, blocoAtual } = await getBlock();

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
            await setLastProcessedBlock(blocoAtual - 1);
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
        console.warn(`Erro ao decodificar input: ${error.message} (${methodId})`);
        return { functionName: "unknown", args: {}, methodId };
    }
}

// blocos
// blocoAtual salva no banco
// blocoProcessado, usa como parametro inicial no get
async function getBlock(start) {
    const blocoAtual = await getCurrentBlockFromRPC(RPC_GLOBAL);

    if (!blocoAtual) {
        console.error(`⛔ Não foi possível obter o bloco atual para `);
    }

    let blocoProcessado = await getLastProcessedBlock();
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
async function getLastProcessedBlock() {
    const lastTx = await Transaction.findOne({
        order: [['blockNumber', 'DESC']],
    });

    const result = lastTx ? lastTx.blockNumber : 0;
    console.log(`Ultimo bloco salvo ${result}`);
    return result;
}

// retorna transações do banco
async function getAllTransactions() {
    try {
        const data = await Transaction.findAll({
            order: [['timeStamp', 'DESC']], // Ordena por data mais recente primeiro
            raw: true // Retorna objetos JavaScript simples
        });
        return data;
    } catch (error) {
        console.error('Erro ao buscar transações:', error);
        throw error;
    }
}

async function setLastProcessedBlock(blockNumber) {
    await BlockTracker.create({ lastBlock: blockNumber });
}


async function getHistoricoDados(carteira, token) {
    try {
        // Busca transações do BD já filtradas por carteira e token
        const transactions = await getAllTransactions();

        // console.log(transactions)

        if (!transactions || !Array.isArray(transactions)) {
            throw new Error("Erro ao obter transações do banco.");
        }

        const data = transactions; // É o array diretamente!
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

async function generateBIDATA(carteira, token) {
    const { resultado: dados } = await getHistoricoDados(carteira, token);

    if (dados.length === 0) return;

    dados.sort((a, b) => {
        const dateA = new Date(a.data.split('/').reverse().join('-'));
        const dateB = new Date(b.data.split('/').reverse().join('-'));
        return dateA - dateB;
    });

    function computeResumo(filtrados, dados) {
        if (filtrados.length === 0) return null;
        const addRem = filtrados.reduce((acc, x) => acc + x.addRem, 0);
        const lucroDia = filtrados.reduce((acc, x) => acc + x.lucroDia, 0);
        const percentual = (filtrados.reduce((acc, x) => acc * (1 + (x.percentual || 0) / 100), 1) - 1) * 100;
        const totalOperacoes = filtrados.reduce((acc, x) => acc + (x.operacoes || 0), 0);
        const totalLucroBruto = filtrados.reduce((acc, x) => acc + (x.lucroBruto || 0), 0);
        const totalPerdaBruta = filtrados.reduce((acc, x) => acc + (x.perdaBruta || 0), 0);
        const primeiroDia = filtrados[0];
        const ultimoDia = filtrados[filtrados.length - 1];
        const idxPrimeiro = dados.findIndex(x => x.data === primeiroDia.data);
        const lucroAcumuladoAntes = idxPrimeiro > 0 ? dados[idxPrimeiro - 1].lucroTotal : 0;
        const lucroTotalPeriodo = ultimoDia.lucroTotal - lucroAcumuladoAntes;
        const capitalInicial = idxPrimeiro > 0 ? dados[idxPrimeiro - 1].capital : 0;
        const capitalFinal = ultimoDia.capital;
        return {
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

    // All
    const resumoAll = computeResumo(dados, dados);
    if (resumoAll) {
        await PeriodConsolidated.upsert({
            wallet: carteira,
            periodType: 'all',
            periodIdentifier: 'all',
            startDate: dados[0].data,
            endDate: dados[dados.length - 1].data,
            ...resumoAll
        });
    }

    // Annual
    const groupsAnnual = {};
    for (const item of dados) {
        const date = new Date(item.data.split('/').reverse().join('-'));
        const year = date.getFullYear().toString();
        if (!groupsAnnual[year]) groupsAnnual[year] = [];
        groupsAnnual[year].push(item);
    }

    for (const [year, items] of Object.entries(groupsAnnual)) {
        const resumo = computeResumo(items, dados);
        if (resumo) {
            const startDate = `01/01/${year}`;
            const endDate = `31/12/${year}`;
            await PeriodConsolidated.upsert({
                wallet: carteira,
                periodType: 'annual',
                periodIdentifier: year,
                startDate,
                endDate,
                ...resumo
            });
        }
    }

    // Semestral
    const groupsSemestral = {};
    for (const item of dados) {
        const date = new Date(item.data.split('/').reverse().join('-'));
        const year = date.getFullYear();
        const semester = date.getMonth() < 6 ? 1 : 2;
        const key = `${year}-S${semester}`;
        if (!groupsSemestral[key]) groupsSemestral[key] = [];
        groupsSemestral[key].push(item);
    }

    for (const [key, items] of Object.entries(groupsSemestral)) {
        const resumo = computeResumo(items, dados);
        if (resumo) {
            const [year, s] = key.split('-S');
            const semester = parseInt(s);
            const startDate = semester === 1 ? `01/01/${year}` : `01/07/${year}`;
            const endDate = semester === 1 ? `30/06/${year}` : `31/12/${year}`;
            await PeriodConsolidated.upsert({
                wallet: carteira,
                periodType: 'semestral',
                periodIdentifier: key,
                startDate,
                endDate,
                ...resumo
            });
        }
    }

    // Trimestral
    const groupsTrimestral = {};
    for (const item of dados) {
        const date = new Date(item.data.split('/').reverse().join('-'));
        const year = date.getFullYear();
        const quarter = Math.floor(date.getMonth() / 3) + 1;
        const key = `${year}-Q${quarter}`;
        if (!groupsTrimestral[key]) groupsTrimestral[key] = [];
        groupsTrimestral[key].push(item);
    }

    for (const [key, items] of Object.entries(groupsTrimestral)) {
        const resumo = computeResumo(items, dados);
        if (resumo) {
            const [year, q] = key.split('-Q');
            const quarter = parseInt(q);
            let startDate, endDate;
            if (quarter === 1) {
                startDate = `01/01/${year}`;
                endDate = `31/03/${year}`;
            } else if (quarter === 2) {
                startDate = `01/04/${year}`;
                endDate = `30/06/${year}`;
            } else if (quarter === 3) {
                startDate = `01/07/${year}`;
                endDate = `30/09/${year}`;
            } else {
                startDate = `01/10/${year}`;
                endDate = `31/12/${year}`;
            }
            await PeriodConsolidated.upsert({
                wallet: carteira,
                periodType: 'trimestral',
                periodIdentifier: key,
                startDate,
                endDate,
                ...resumo
            });
        }
    }

    // Mensal
    const groupsMensal = {};
    for (const item of dados) {
        const date = new Date(item.data.split('/').reverse().join('-'));
        const year = date.getFullYear();
        const month = (date.getMonth() + 1).toString().padStart(2, '0');
        const key = `${year}-${month}`;
        if (!groupsMensal[key]) groupsMensal[key] = [];
        groupsMensal[key].push(item);
    }
    for (const [key, items] of Object.entries(groupsMensal)) {
        const resumo = computeResumo(items, dados);
        if (resumo) {
            const [year, month] = key.split('-');
            const lastDay = new Date(parseInt(year), parseInt(month), 0).getDate();
            const startDate = `01/${month}/${year}`;
            const endDate = `${lastDay.toString().padStart(2, '0')}/${month}/${year}`;
            await PeriodConsolidated.upsert({
                wallet: carteira,
                periodType: 'mensal',
                periodIdentifier: key,
                startDate,
                endDate,
                ...resumo
            });
        }
    }

    // Semanal (ISO week)
    function getISOWeekNumber(d) {
        d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
        const dayNum = d.getUTCDay() || 7;
        d.setUTCDate(d.getUTCDate() + 4 - dayNum);
        const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
        return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
    }
    function getWeekStartEnd(year, week) {
        const jan4 = new Date(year, 0, 4);
        const dayOfWeek = jan4.getDay() || 7;
        const firstMonday = new Date(year, 0, 4 + (1 - dayOfWeek));
        const start = new Date(firstMonday);
        start.setDate(start.getDate() + (week - 1) * 7);
        const end = new Date(start);
        end.setDate(end.getDate() + 6);
        function formatDate(d) {
            return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1).toString().padStart(2, '0')}/${d.getFullYear()}`;
        }
        return { startDate: formatDate(start), endDate: formatDate(end) };
    }
    const groupsSemanal = {};
    for (const item of dados) {
        const date = new Date(item.data.split('/').reverse().join('-'));
        const year = date.getFullYear();
        const weekNum = getISOWeekNumber(date);
        const week = weekNum.toString().padStart(2, '0');
        const key = `${year}-W${week}`;
        if (!groupsSemanal[key]) groupsSemanal[key] = [];
        groupsSemanal[key].push(item);
    }
    for (const [key, items] of Object.entries(groupsSemanal)) {
        const resumo = computeResumo(items, dados);
        if (resumo) {
            const [year, w] = key.split('-W');
            const week = parseInt(w);
            const { startDate, endDate } = getWeekStartEnd(parseInt(year), week);
            await PeriodConsolidated.upsert({
                wallet: carteira,
                periodType: 'semanal',
                periodIdentifier: key,
                startDate,
                endDate,
                ...resumo
            });
        }
    }
}

async function populateDailyData(carteira, token) {
    const { resultado: dados } = await getHistoricoDados(carteira, token);

    if (dados.length === 0) return;

    // Os dados já estão ordenados por data no getHistoricoDados, via sort das datas.
    // O percentual já é calculado usando calculaPPT (modelo PPT para porcentagem ponderada).

    for (const item of dados) {
        await DailyData.upsert({
            wallet: carteira,
            data: item.data,
            addRem: item.addRem,
            lucroDia: item.lucroDia,
            percentual: item.percentual,
            operacoes: item.operacoes,
            lucroBruto: item.lucroBruto,
            perdaBruta: item.perdaBruta,
            lucroTotal: item.lucroTotal,
            capital: item.capital
        });
    }
}


module.exports = {
    geraTxBd,
    generateBIDATA,
    populateDailyData,
};