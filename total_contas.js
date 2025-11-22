require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');

const RPC_GLOBAL = process.env.RPC_GLOBAL;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(RPC_GLOBAL);
const TOKEN_COLATERAL_ADDRESS_V5 = process.env.TOKEN_COLATERAL_ADDRESS_V5

const ABI_DECODE_TX = [
    "function LiquidityAdd(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityAdd(string accountId,address strategyToken,address coin,uint256 amount)", // fallback possível
    "function LiquidityRemove(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityRemove(string accountId,address strategyToken,address coin,uint256 amount)", // fallback
    "function openPosition(address contractAddress,string accountId,address strategyToken,address user,int256 amount,(address,address)[] pairs,uint256 leverage,address referrer)",
    "function openPosition(address, string, address, address, int256, (address,address)[], uint256, address, string)"
];

// Função para buscar transações novas via API
async function getTransactionsAPI() {
    console.log("⚙️ Executando getTransactionsAPI");

    try {
        const params = new URLSearchParams({
            chainid: '137',
            module: 'account',
            action: 'tokentx',
            contractaddress: TOKEN_COLATERAL_ADDRESS_V5,
            sort: 'asc',
            apikey: POLYGONSCAN_API_KEY,
            startblock: 79313392,
        });

        const url = `https://api.etherscan.io/v2/api?${params.toString()}`; // Se for Polygon, teste com api.polygonscan.com
        const response = await axios.get(url);
        const data = response.data;

        if (!data.result || !Array.isArray(data.result)) {
            throw new Error("Erro ao obter transações.");
        }

        let setContas = new Set();
        let repetidos = 0;
        let unicos = 0;
        let i = 0;

        const txs = data.result;

        const delay = (ms) => new Promise(resolve => setTimeout(resolve, ms));

        for (const tx of txs) {
            const txHash = tx.hash;

            // Assumindo que decodeTransactionInput é async; se não for, remova o await
            const dadosTx = await decodeTransactionInput(txHash, provider);
            const conta = dadosTx?.args?.accountId?.[0] || 'unknown';

            if (setContas.has(conta)) {
                repetidos += 1;
            } else {
                setContas.add(conta);
                unicos += 1;
            }

            if (i === 10) {
                console.log(`unicos: ${unicos}, repetidos: ${repetidos}`);
                i = 0;
            }

            i += 1;

            // Delay aqui pra dar um respiro pro provider – ajuste o ms se precisar
            await delay(200);
        }

        console.log(`Finalizado\n\nunicos: ${unicos}, repetidos: ${repetidos}`);

    } catch (error) {
        console.error("Erro em getTransactionsAPI:", error);
        return [];
    }
}

// Função que busca e decodifica input data
async function decodeTransactionInput(txHash, provider1) {
    // console.log("⚙️ Executando decodeTransactionInput");

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

async function getCurrentBlockFromRPC(rpc) {
    //const provider = new ethers.JsonRpcProvider(rpc);
    const blockNumber = await provider.getBlockNumber();

    console.log(`Bloco atual ${blockNumber}`);
    return blockNumber;
}

function formatHours(decimalHours) {
    const hours = Math.floor(decimalHours);
    const minutes = Math.round((decimalHours - hours) * 60);

    if (hours === 0) return `${minutes} min`;
    if (minutes === 0) return `${hours} h`;

    return `${hours} h ${minutes} min`;
}


async function getProtocolSpeed(totalAccounts) {
    const endBlock = await provider.getBlockNumber();
    const startBlock = endBlock - 300;

    const params = new URLSearchParams({
        chainid: '137',
        module: 'account',
        action: 'tokentx',
        contractaddress: TOKEN_COLATERAL_ADDRESS_V5,
        sort: 'asc',
        apikey: POLYGONSCAN_API_KEY,
        startblock: startBlock,
        endblock: endBlock
    });

    const url = `https://api.etherscan.io/v2/api?${params.toString()}`;
    const response = await axios.get(url);
    const data = response.data;

    console.log(url)

    if (!data.result || !Array.isArray(data.result)) {
        throw new Error("Erro ao obter transações.");
    }

    const txList = data.result || [];

    if (txList.length === 0) {
        return {
            txPerMinute: 0,
            cycleMinutes: Infinity,
            cycleHours: Infinity,
            activeTx: 0
        };
    }

    const blockStart = await provider.getBlock(startBlock);
    const blockEnd = await provider.getBlock(endBlock);

    const minutes = (blockEnd.timestamp - blockStart.timestamp) / 60;
    const txPerMinute = txList.length / minutes;

    const cycleMinutes = totalAccounts / txPerMinute;
    const cycleHours = cycleMinutes / 60;

    return {
        startBlock,
        endBlock,
        minutesInterval: Number(minutes.toFixed(2)),
        activeTx: txList.length,
        txPerMinute: Number(txPerMinute.toFixed(4)),
        cycleMinutes: Number(cycleMinutes.toFixed(2)),
        cycleHours: Number(cycleHours.toFixed(2))
    };
}

function formatProtocolSpeed(result, totalAccounts) {
    return `
📊 *Atividade do Protocolo (últimos 100 blocos)*

⛓️ *Blocos analisados:*
• ${result.startBlock} → ${result.endBlock}

⏱️ *Tempo real analisado:* 
• ${result.minutesInterval.toFixed(2)} minutos

🔁 *Transações:*
• ${result.activeTx} transações no período
• ${result.txPerMinute.toFixed(2)} tx/min

👥 *Contas no ciclo:*
• ${totalAccounts} contas

⏳ *Tempo estimado para um ciclo completo:*
• ${result.cycleMinutes.toFixed(0)} minutos
• ${formatHours(result.cycleHours)}
`.trim();
}


(async () => {
    // 1) obter número total de contas
    const total = 1864; // await Account.count(); // vindo da FUNÇÃO 1

    // 2) medir velocidade do protocolo
    const speed = await getProtocolSpeed(total);
    const formata = await formatProtocolSpeed(speed, total)

    console.log("Total contas:", total);
    console.log(formata);
})();
