
const { getHistoricoDados } = require('./fun')
const db = require('../db/database');
const { sequelize, PeriodConsolidated, DailyData, DailyDataByAccount, PeriodConsolidatedByAccount } = db;

async function populateDailyData(carteira, token) {
    const { resultado: dados } = await getHistoricoDados(carteira, token);

    if (dados.length === 0) return;

    for (const item of dados) {
        await DailyData.upsert({
            wallet: carteira,
            token,
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
            token,
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
                token,
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
                token,
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
                token,
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
                token,
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
                token,
                periodType: 'semanal',
                periodIdentifier: key,
                startDate,
                endDate,
                ...resumo
            });
        }
    }
}


async function populateDailyDataByAccount(carteira, token) {
    const { Transaction } = db;
    const contas = await Transaction.findAll({
        where: { carteira, token },
        attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('conta')), 'conta']],
        raw: true,
    });

    for (const { conta } of contas) {
        const { resultado: dados } = await getHistoricoDados(carteira, token, conta);
        if (!dados?.length) continue;

        for (const item of dados) {
            await DailyDataByAccount.upsert({
                wallet: carteira,
                token,
                conta,
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
}

async function generateBIDATAByAccount(carteira, token) {
    const { Transaction } = db;
    const contas = await Transaction.findAll({
        where: { carteira, token },
        attributes: [[db.sequelize.fn('DISTINCT', db.sequelize.col('conta')), 'conta']],
        raw: true,
    });

    for (const { conta } of contas) {
        const { resultado: dados } = await getHistoricoDados(carteira, token, conta);
        if (!dados?.length) continue;

        // Usa a mesma função computeResumo e lógica da generateBIDATA original
        // apenas salvando no PeriodConsolidatedByAccount
        const resumo = (items, all) => {
            if (items.length === 0) return null;
            const addRem = items.reduce((a, x) => a + x.addRem, 0);
            const lucroDia = items.reduce((a, x) => a + x.lucroDia, 0);
            const percentual = (items.reduce((a, x) => a * (1 + (x.percentual || 0) / 100), 1) - 1) * 100;
            const totalOperacoes = items.reduce((a, x) => a + (x.operacoes || 0), 0);
            const totalLucroBruto = items.reduce((a, x) => a + (x.lucroBruto || 0), 0);
            const totalPerdaBruta = items.reduce((a, x) => a + (x.perdaBruta || 0), 0);
            const primeiroDia = items[0];
            const ultimoDia = items[items.length - 1];
            const idxPrimeiro = all.findIndex(x => x.data === primeiroDia.data);
            const lucroAcumuladoAntes = idxPrimeiro > 0 ? all[idxPrimeiro - 1].lucroTotal : 0;
            const lucroTotalPeriodo = ultimoDia.lucroTotal - lucroAcumuladoAntes;
            const capitalInicial = idxPrimeiro > 0 ? all[idxPrimeiro - 1].capital : 0;
            const capitalFinal = ultimoDia.capital;
            return { addRem, lucroDia, lucroTotal: lucroTotalPeriodo, capitalInicial, capitalFinal, percentual, totalOperacoes, totalLucroBruto, totalPerdaBruta };
        };

        // Agrupar períodos (reuso do código original)
        const agrupar = (fnKey, fnDates) => {
            const grupos = {};
            for (const item of dados) {
                const key = fnKey(item);
                if (!grupos[key]) grupos[key] = [];
                grupos[key].push(item);
            }
            return Object.entries(grupos).map(([key, items]) => {
                const resumoCalc = resumo(items, dados);
                if (!resumoCalc) return null;
                const { startDate, endDate } = fnDates(key);
                return {
                    wallet: carteira,
                    token,
                    conta,
                    periodType: key.includes('Q') ? 'trimestral' :
                        key.includes('S') ? 'semestral' :
                            key.includes('W') ? 'semanal' :
                                key.includes('-') && key.length === 7 ? 'mensal' :
                                    'annual',
                    periodIdentifier: key,
                    startDate,
                    endDate,
                    ...resumoCalc
                };
            }).filter(Boolean);
        };

        // Exemplo: mensal
        const mensal = agrupar(
            (i) => {
                const d = new Date(i.data.split('/').reverse().join('-'));
                return `${d.getFullYear()}-${(d.getMonth() + 1).toString().padStart(2, '0')}`;
            },
            (key) => {
                const [year, month] = key.split('-');
                const lastDay = new Date(year, month, 0).getDate();
                return { startDate: `01/${month}/${year}`, endDate: `${lastDay}/${month}/${year}` };
            }
        );

        for (const row of mensal) {
            await PeriodConsolidatedByAccount.upsert(row);
        }

        // === 🔹 SEMANAL ===
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
                return `${d.getDate().toString().padStart(2, '0')}/${(d.getMonth() + 1)
                    .toString()
                    .padStart(2, '0')}/${d.getFullYear()}`;
            }
            return { startDate: formatDate(start), endDate: formatDate(end) };
        }

        const semanal = agrupar(
            (i) => {
                const d = new Date(i.data.split('/').reverse().join('-'));
                const year = d.getFullYear();
                const week = getISOWeekNumber(d).toString().padStart(2, '0');
                return `${year}-W${week}`;
            },
            (key) => {
                const [year, w] = key.split('-W');
                const week = parseInt(w);
                return getWeekStartEnd(parseInt(year), week);
            }
        );

        for (const row of semanal) {
            await PeriodConsolidatedByAccount.upsert(row);
        }
    }
}


module.exports = {
    generateBIDATA,
    populateDailyData,
    populateDailyDataByAccount,
    generateBIDATAByAccount
};