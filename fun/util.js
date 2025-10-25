const ABI_DECODE_TX = [
  "function LiquidityAdd(string[] accountId,address strategyToken,address coin,uint256 amount)",
  "function LiquidityAdd(string accountId,address strategyToken,address coin,uint256 amount)", // fallback possível
  "function LiquidityRemove(string[] accountId,address strategyToken,address coin,uint256 amount)",
  "function LiquidityRemove(string accountId,address strategyToken,address coin,uint256 amount)", // fallback
  "function openPosition(address contractAddress,string accountId,address strategyToken,address user,int256 amount,(address,address)[] pairs,uint256 leverage,address referrer)"
];


const ERC20_MIN_ABI = [
    "function decimals() view returns (uint8)",
    "function symbol() view returns (string)",
    "function name() view returns (string)",
];

const tokenList = [
  {
    name: "POL",
    address: "0x455e53cbb86018ac2b8092fdcd39d8444affc3f6"
  },
  {
    name: "USDT",
    address: "0xc2132D05D31c914a87C6611C10748AEb04B58e8F"
  },
  {
    name: "LPUSDT",
    address: "0xfb2e2ff7b51c2bcaf58619a55e7d2ff88cfd8aca"
  },
  {
    name: "WebDex",
    address: "0xf49dA0F454d212B80F40693cdDd452D8Caa2fa6d"
  }
];

function formatarDataSimples(timestamp) {
  const date = new Date(timestamp * 1000);
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
}

// Função auxiliar para converter timestamp em data legível
function formatarData(timestamp) {
  const data = new Date(timestamp * 1000); // timestamp vem em segundos
  const dia = String(data.getDate()).padStart(2, '0');
  const mes = String(data.getMonth() + 1).padStart(2, '0');
  const ano = data.getFullYear();
  const hora = String(data.getHours()).padStart(2, '0');
  const minuto = String(data.getMinutes()).padStart(2, '0');
  return `${dia}/${mes}/${ano} ${hora}:${minuto}`;
}

function identificarTipoOperacaoPorNome(functionName) {
  if (!functionName) return 'Desconhecido';

  if (functionName.startsWith('LiquidityAdd')) {
    return 'LiquidityAdd';
  }
  if (functionName.startsWith('LiquidityRemove')) {
    return 'LiquidityRemove';
  }
  if (functionName.startsWith('openPosition')) {
    return 'OpenPosition';
  }

  return 'Desconhecido';
}

module.exports = {
    ABI_DECODE_TX,
    ERC20_MIN_ABI,
    tokenList,
    formatarData,
    formatarDataSimples,
    identificarTipoOperacaoPorNome
};