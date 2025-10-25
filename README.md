
# BI Dashboard Implementation

## Overview
O objetivo é gerar a base de dados de transações no Defi Webdex
Os dados serão salvos estruturados com resumos por periodos para utilizar em sistemas de BI

- Verifica transações usando API da Etherscan V2
- Salva as transações estruturadas no banco de dados 
- Gera dados estruturados com resumos diarios
- Gera dados estruturados com resumos por períodos


## Prerequisites
- Node.js (v14+ recommended).
- npm (comes with Node.js).

## Setup Instructions
1. Instale as dependencias com npm install
2. crie o arquivo .env com os dados de carteira, contrato e chave de API.
3. Execute node db/get.js para gerar ou atualizar as tabelas

