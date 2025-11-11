// public/app.js 

document.addEventListener('DOMContentLoaded', async () => {
  const chartsSection = document.getElementById('charts');
  const toggleDarkMode = document.getElementById('toggle-dark-mode');

  // Dark mode toggle
  toggleDarkMode.addEventListener('click', () => {
    document.body.classList.toggle('dark-mode');
  });

  // Chart rendering functions (easy to add new ones by creating similar functions)
  function createChartContainer(title) {
    const container = document.createElement('div');
    container.className = 'chart-container';
    const canvas = document.createElement('canvas');
    container.appendChild(document.createElement('h2')).textContent = title;
    container.appendChild(canvas);
    chartsSection.appendChild(container);
    return canvas;
  }

  function renderMonthlyBarChart(monthlyData) {
    console.log('Rendering Monthly Bar Chart with data:', monthlyData);
    const ctx = createChartContainer('Período Mensal');
    const labels = monthlyData.map(d => d.periodIdentifier);
    new Chart(ctx, {
      type: 'bar',
      data: {
        labels,
        datasets: [
          { label: 'Ganhos', data: monthlyData.map(d => d.totalLucroBruto), backgroundColor: 'blue' },
          { label: 'Perdas', data: monthlyData.map(d => d.totalPerdaBruta), backgroundColor: 'red' },
          { label: 'Lucro', data: monthlyData.map(d => d.lucroDia), backgroundColor: 'green' }
        ]
      },
      options: {
        responsive: true,
        scales: {
          x: { stacked: false },
          y: { stacked: false }
        }
      }
    });
  }

  function renderWeeklyLineChart(weeklyData) {
    console.log('Rendering Weekly Line Chart with data:', weeklyData);
    const ctx = createChartContainer('Período Semanal');
    const labels = weeklyData.map(d => d.periodIdentifier);
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Ganhos', data: weeklyData.map(d => d.totalLucroBruto), borderColor: 'blue', fill: false },
          { label: 'Lucro', data: weeklyData.map(d => d.lucroDia), borderColor: 'green', fill: false },
          { label: 'Perdas', data: weeklyData.map(d => d.totalPerdaBruta), borderColor: 'red', fill: false }
        ]
      },
      options: { responsive: true }
    });
  }

  // Weekly percentual evolution (line)
  function renderWeeklyPercentualChart(weeklyData) {
    console.log('Rendering Weekly Percentual Chart with data:', weeklyData);
    const ctx = createChartContainer('Semanal "%"');
    const labels = weeklyData.map(d => d.periodIdentifier);
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Percentual', data: weeklyData.map(d => d.percentual), borderColor: 'green', fill: false }
        ]
      },
      options: { responsive: true }
    });
  }


  function renderDailyLineChart(dailyData) {
    console.log('Rendering Weekly Percentual Chart with data:', dailyData);
    const ctx = createChartContainer('Diário "%"');
    const labels = dailyData.map(d => d.data);
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          { label: 'Percentual', data: dailyData.map(d => d.percentual), borderColor: 'green', fill: false }
        ]
      },
      options: { responsive: true }
    });
  }

  // Capital total and profit evolution (line, using daily data)
  function renderCapitalProfitChart(dailyData) {
    console.log('Rendering Capital Profit Chart with data:', dailyData);
    const ctx = createChartContainer('Lucro total');
    const labels = dailyData.map(d => d.data);
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          //  { label: 'Capital Total', data: dailyData.map(d => d.capital), borderColor: 'blue', fill: false },
          { label: 'Lucro Total', data: dailyData.map(d => d.lucroTotal), borderColor: 'orange', fill: false }
        ]
      },
      options: { responsive: true }
    });
  }



  // lucro e capital
  function renderWeeklyLineLucroCapital(dailyData) {
    console.log('Rendering Capital Profit Chart with data:', dailyData);
    const ctx = createChartContainer('Lucro total');
    const labels = dailyData.map(d => d.data);
    new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          //  { label: 'Capital Total', data: dailyData.map(d => d.capital), borderColor: 'blue', fill: false },
          { label: 'Lucro Total', data: dailyData.map(d => d.lucroTotal), borderColor: 'orange', fill: false },
          { label: 'capital', data: dailyData.map(d => d.capital), borderColor: 'blue', fill: false }
        ]
      },
      options: { responsive: true }
    });
  }


  // Pie chart: Percentual por conta
  function renderPercentualPorContaChart(data) {
    const ctx = createChartContainer('Percentual por Conta');
    const labels = data.map(d => d.conta);
    const values = data.map(d => parseFloat(d.percentualTotal).toFixed(2));
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          label: 'Percentual (%)',
          data: values,
          backgroundColor: [
            '#4CAF50', '#2196F3', '#FF9800', '#E91E63', '#9C27B0', '#00BCD4'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: ${ctx.parsed}%`
            }
          }
        }
      }
    });
  }

  // Pie chart: Lucro total por conta
  function renderLucroPorContaChart(data) {
    const ctx = createChartContainer('Lucro Total por Conta');
    const labels = data.map(d => d.conta);
    const values = data.map(d => parseFloat(d.lucroTotal).toFixed(2));
    new Chart(ctx, {
      type: 'pie',
      data: {
        labels,
        datasets: [{
          label: 'Lucro Total',
          data: values,
          backgroundColor: [
            '#FF5722', '#3F51B5', '#8BC34A', '#FFC107', '#009688', '#9E9E9E'
          ]
        }]
      },
      options: {
        responsive: true,
        plugins: {
          legend: { position: 'right' },
          tooltip: {
            callbacks: {
              label: ctx => `${ctx.label}: $${ctx.parsed}`
            }
          }
        }
      }
    });
  }



  // Auto-load all data on page load
  console.log('Starting auto-load of all data...');
  // Clear existing charts (though not necessary on load)
  chartsSection.innerHTML = '';

  try {
    // Get monthly data (all)
    console.log('Fetching monthly data...');
    const monthlyResponse = await fetch('/api/periods/mensal');
    const monthlyData = await monthlyResponse.json();
    console.log('Monthly data received:', monthlyData);

    // Get weekly data (all)
    console.log('Fetching weekly data...');
    const weeklyResponse = await fetch('/api/periods/semanal');
    const weeklyData = await weeklyResponse.json();
    console.log('Weekly data received:', weeklyData);

    // Get daily data (all)
    console.log('Fetching daily data...');
    const dailyResponse = await fetch('/api/daily');
    const dailyData = await dailyResponse.json();
    console.log('Daily data received:', dailyData);

    // Get account summary data
    console.log('Fetching account summary...');
    const accountSummaryResponse = await fetch('/api/accounts-summary');
    const accountSummaryData = await accountSummaryResponse.json();
    console.log('Account summary received:', accountSummaryData);

    renderMonthlyBarChart(monthlyData);
    renderWeeklyLineChart(weeklyData);
    renderWeeklyPercentualChart(weeklyData);
    renderDailyLineChart(dailyData);
    renderCapitalProfitChart(dailyData);
    renderWeeklyLineLucroCapital(dailyData);
    renderPercentualPorContaChart(accountSummaryData);
    renderLucroPorContaChart(accountSummaryData);

  } catch (error) {
    console.error('Error loading data:', error);
    alert('Erro ao carregar dados. Verifique o console para detalhes.');
  }
});