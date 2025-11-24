require("dotenv").config();
const axios = require('axios');
const ethers = require('ethers');
const fs = require('fs').promises;
const path = require('path');

const RPC_GLOBAL = process.env.RPC_GLOBAL;
const POLYGONSCAN_API_KEY = process.env.POLYGONSCAN_API_KEY;
const provider = new ethers.JsonRpcProvider(RPC_GLOBAL);
const TOKEN_COLATERAL_ADDRESS_V5 = process.env.TOKEN_COLATERAL_ADDRESS_V5
const FILE_PATH = path.resolve('./data/unique_holders_24h.json');

// Blocos por hora na Polygon ≈ 1714 (2.1s médio)
const BLOCKS_24H = 1714 * 12;

const ABI_DECODE_TX = [
    "function LiquidityAdd(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityAdd(string accountId,address strategyToken,address coin,uint256 amount)", // fallback possível
    "function LiquidityRemove(string[] accountId,address strategyToken,address coin,uint256 amount)",
    "function LiquidityRemove(string accountId,address strategyToken,address coin,uint256 amount)", // fallback
    "function openPosition(address contractAddress,string accountId,address strategyToken,address user,int256 amount,(address,address)[] pairs,uint256 leverage,address referrer)",
    "function openPosition(address, string, address, address, int256, (address,address)[], uint256, address, string)"
];

/**
 * Função principal – agora com:
 * 1. Bloco inicial calculado dinamicamente (-24h)
 * 2. Salvamento automático em JSON (pra seu cron diário)
 * 3. Retorna o número de contas únicas pra usar na estimativa de tempo
 */
async function getUniqueHoldersLast24h() {
    try {
        // 1. Pegar bloco atual e calcular o inicial (-24h)
        const endBlock = await provider.getBlockNumber();
        const startBlock = endBlock - BLOCKS_24H;

        console.log(`🟢 Monitorando últimas ~24h`);
        console.log(`   Bloco atual: ${endBlock}`);
        console.log(`   Bloco inicial (≈24h atrás): ${startBlock}`);

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

        if (data.status !== "1" || !Array.isArray(data.result)) {
            throw new Error(`Polygonscan error: ${data.message || data.result}`);
        }

        const txs = data.result;
        console.log(`📡 ${txs.length} transações encontradas nas últimas 24h`);

        const uniqueAccounts = new Set();
        let decodedCount = 0;

        const delay = (ms) => new Promise(res => setTimeout(res, ms));

        for (const tx of txs) {
            try {
                const txHash = tx.hash;
                const decoded = await decodeTransactionInput(txHash, provider);
                const accountId = decoded?.args?.accountId?.[0];

                if (accountId && accountId !== 'unknown') {
                    uniqueAccounts.add(accountId.toLowerCase()); // evita case-sensitive
                    decodedCount++;
                }

                // Log a cada 50 txs pra você sentir o cyber-pulse
                if (decodedCount % 50 === 0 && decodedCount > 0) {
                    console.log(`⚡ Decodificados: ${decodedCount} | Contas únicas até agora: ${uniqueAccounts.size}`);
                }

                await delay(180); // respeitando rate limit (~5 req/s)
            } catch (err) {
                // uma tx falhar não mata o batch todo
                continue;
            }
        }

        const result = {
            timestamp: new Date().toISOString(),
            startBlock,
            endBlock,
            totalTransactions: txs.length,
            successfullyDecoded: decodedCount,
            uniqueHolders: uniqueAccounts.size,
            holdersList: Array.from(uniqueAccounts), // opcional: salva a lista completa
        };

        // 2. Salva em JSON lindo pra seu cron diário
        await fs.mkdir(path.dirname(FILE_PATH), { recursive: true });
        await fs.writeFile(FILE_PATH, JSON.stringify(result, null, 2));
        console.log(`💾 Dados salvos em ${FILE_PATH}`);
        console.log(`🎉 Holders únicos nas últimas 24h: ${result.uniqueHolders}`);

        return result.uniqueHolders; // ← valor que você vai usar na estimativa!

    } catch (error) {
        console.error("💥 Erro crítico em getUniqueHoldersLast24h:", error.message);
        return 0;
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

   // await getUniqueHoldersLast24h();

    const data = await fs.readFile(FILE_PATH, 'utf-8');
    const json = JSON.parse(data);
    console.log(json.uniqueHolders)

    // 1) obter número total de contas
    const total = json.uniqueHolders || 1864;

    // 2) medir velocidade do protocolo
    const speed = await getProtocolSpeed(total);
    const formata = await formatProtocolSpeed(speed, total)

    console.log("Total contas:", total);
    console.log(formata);
})();
