// ================ CONFIGURAÇÕES E CONSTANTES ================
const CONFIG = {
  VERIFICATION_CODE: '123456a',
  TARIFAS: {
    CONSUMO_MINIMO: 375,
    VALOR_M3: 75,
    LIMITE_CONSUMO_MINIMO: 5
  },
  LOCAL_STORAGE_KEY: 'waterManagementData',
  DATE_FORMATS: {
    DISPLAY: 'pt-BR',
    STORAGE: 'ISO'
  }
};

// ================ SELEÇÃO DE ELEMENTOS OTIMIZADA ================
const DOM = {
  // Menu e autenticação
  menuButton: document.getElementById('menu-button'),
  sideMenu: document.getElementById('side-menu'),
  authSection: document.getElementById('auth-section'),
  adminActions: document.getElementById('admin-actions'),
  authForm: document.getElementById('auth-form'),
  verificationCodeInput: document.getElementById('verification-code'),
  
  // Views
  views: document.querySelectorAll('main > section'),
  
  // Modal Cliente
  clientModal: document.getElementById('client-modal'),
  closeClientModalButton: document.getElementById('close-client-modal-button'),
  clientForm: document.getElementById('client-form'),
  clientModalTitle: document.getElementById('client-modal-title'),
  clientIdInput: document.getElementById('client-id'),
  clientNameInput: document.getElementById('client-name'),
  clientContactInput: document.getElementById('client-contact'),
  clientConnectionDateInput: document.getElementById('client-connection-date'),
  
  // Tabela Clientes
  clientsTableBody: document.getElementById('clients-table-body'),
  clientSearchClients: document.getElementById('client-search-clients'),
  
  // Faturas
  invoicesTableBody: document.getElementById('invoices-table-body'),
  invoiceSearch: document.getElementById('invoice-search'),
  
  // Pagamentos
  paymentsTableBody: document.getElementById('payments-table-body'),
  clientSearchPayments: document.getElementById('client-search-payments'),
  
  // Contratos
  contractsTableBody: document.getElementById('contracts-table-body'),
  contractModal: document.getElementById('contract-modal'),
  closeContractModalButton: document.getElementById('close-contract-modal-button'),
  contractForm: document.getElementById('contract-form'),
  contractModalTitle: document.getElementById('contract-modal-title'),
  contractIdInput: document.getElementById('contract-id'),
  contractClientSelect: document.getElementById('contract-client-select'),
  contractValueInput: document.getElementById('contract-value'),
  
  // Recibos
  receiptsContainer: document.getElementById('receipts-container'),
  newMonthButton: document.getElementById('new-month-button'),
  editReceiptOrderButton: document.getElementById('edit-receipt-order-button'),
  clientStartIdInput: document.getElementById('client-start-id'),
  clientEndIdInput: document.getElementById('client-end-id'),
  generateReceiptsByRangeButton: document.getElementById('generate-receipts-by-range-button'),
  
  // Importação
  importInvoiceButton: document.getElementById('import-invoice-data-button'),
  importInvoiceFileInput: document.getElementById('import-invoice-file-input'),
  importFileInput: document.getElementById('import-file-input'),
  
  // Exportação
  exportReadingsButton: null // Será criado dinamicamente
};

// ================ ESTADO DA APLICAÇÃO ================
let state = {
  clients: [],
  invoices: {},
  payments: {},
  contracts: {},
  receiptOrder: []
};

let isAuthenticated = false;
let generatedBinarySignatures = new Set();
let calculationCache = new Map();
let originalCellValue = null;

// ================ UTILITÁRIOS ================
class Utils {
  static formatDate(date, format = 'DISPLAY') {
    if (!date) return '';
    
    try {
      const d = new Date(date);
      if (format === 'DISPLAY') {
        return d.toLocaleDateString('pt-BR', {
          day: '2-digit',
          month: '2-digit',
          year: 'numeric'
        });
      }
      return d.toISOString();
    } catch (error) {
      console.error('Erro ao formatar data:', error);
      return '';
    }
  }
  
  static parseNumber(value) {
    if (typeof value === 'number') return value;
    if (!value) return 0;
    
    try {
      let cleanValue = String(value).trim();
      
      // Remove espaços
      cleanValue = cleanValue.replace(/\s/g, '');
      
      // Se a string contém vírgula e ponto, remove os pontos (separadores de milhar) e troca a vírgula por ponto
      if (cleanValue.includes(',') && cleanValue.includes('.')) {
        cleanValue = cleanValue.replace(/\./g, '').replace(',', '.');
      } 
      // Se a string contém vírgula e não contém ponto, troca a vírgula por ponto
      else if (cleanValue.includes(',') && !cleanValue.includes('.')) {
        cleanValue = cleanValue.replace(',', '.');
      }
      // Se a string contém ponto e não contém vírgula, e há mais de um ponto, remove os pontos (separadores de milhar)
      else if (cleanValue.includes('.') && !cleanValue.includes(',')) {
        const dotCount = (cleanValue.match(/\./g) || []).length;
        if (dotCount > 1) {
          cleanValue = cleanValue.replace(/\./g, '');
        }
        // Caso contrário, assume que o ponto é separador decimal e não faz nada
      }
      
      const parsed = parseFloat(cleanValue);
      return isNaN(parsed) ? 0 : parsed;
    } catch (error) {
      console.error('Erro ao parsear número:', error);
      return 0;
    }
  }
  
  static validateClientData(client) {
    const errors = [];
    
    if (!client.name || client.name.trim().length < 2) {
      errors.push('Nome inválido (mínimo 2 caracteres)');
    }
    
    if (!client.contact || !/^8[0-9]{8}$/.test(String(client.contact).trim())) {
      errors.push('Contacto inválido (formato: 8XXXXXXXX)');
    }
    
    if (!client.connectionDate) {
      errors.push('Data de ligação obrigatória');
    }
    
    return errors;
  }
  
  static generateUniqueId(existingIds) {
    if (!existingIds || existingIds.length === 0) return 1;
    const maxId = Math.max(...existingIds);
    return maxId + 1;
  }
  
  static debounce(fn, delay) {
    let timeout;
    return function(...args) {
      clearTimeout(timeout);
      timeout = setTimeout(() => fn.apply(this, args), delay);
    };
  }
  
  static generateRandomInvoiceNumber(existingNumbers) {
    let number;
    do {
      number = Math.floor(Math.random() * 9000000000) + 1000000000;
    } while (existingNumbers && existingNumbers.has(number));
    return number;
  }
  
  static formatDateForDisplay(dateString) {
    if (!dateString) return '';
    const date = new Date(dateString);
    return date.toLocaleDateString('pt-BR');
  }
}

// ================ CÁLCULOS ================
class Calculator {
  static calculateInvoice(clientId, invoiceData, clientSituacao) {
    const cacheKey = `invoice_${clientId}_${JSON.stringify(invoiceData)}_${clientSituacao}`;
    
    if (calculationCache.has(cacheKey)) {
      return calculationCache.get(cacheKey);
    }
    
    const invoice = invoiceData || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
    let consumption = 0;
    let tariff = 0;
    let totalToPay = 0;
    
    // Cliente Fechado
    if (clientSituacao === 'F') {
      totalToPay = Utils.parseNumber(invoice.debt);
    }
    // Cliente Não
    else if (clientSituacao === 'N') {
      totalToPay = Utils.parseNumber(invoice.debt);
    }
    // Cliente Aberto com consumo zero
    else if (clientSituacao === 'A' && (invoice.currentReading || 0) === (invoice.prevReading || 0)) {
      consumption = 0;
      tariff = CONFIG.TARIFAS.CONSUMO_MINIMO;
      totalToPay = Utils.parseNumber(invoice.debt) + tariff;
    }
    // Cliente Aberto com consumo
    else {
      const hasNewReading = (invoice.currentReading || 0) > (invoice.prevReading || 0);
      consumption = Math.max(0, (invoice.currentReading || 0) - (invoice.prevReading || 0));
      
      if (hasNewReading) {
        tariff = consumption <= CONFIG.TARIFAS.LIMITE_CONSUMO_MINIMO 
          ? CONFIG.TARIFAS.CONSUMO_MINIMO 
          : consumption * CONFIG.TARIFAS.VALOR_M3;
      }
      
      totalToPay = Utils.parseNumber(invoice.debt) + tariff;
    }
    
    // Valor personalizado sobrepõe cálculo
    if (invoice.customAmount != null) {
      totalToPay = Utils.parseNumber(invoice.customAmount);
    }
    
    const result = { consumption, tariff, totalToPay };
    calculationCache.set(cacheKey, result);
    
    return result;
  }
  
  static calculatePayments(paymentData) {
    const payments = paymentData || { p1: { amount: 0 }, p2: { amount: 0 }, p3: { amount: 0 } };
    const totalPaid = (payments.p1.amount || 0) + 
                     (payments.p2.amount || 0) + 
                     (payments.p3.amount || 0);
    return totalPaid;
  }
  
  static calculateContractTotals(contract) {
    if (!contract) return { totalPaid: 0, remaining: 0 };
    
    const totalPaid = (contract.payments.p1.amount || 0) +
                     (contract.payments.p2.amount || 0) +
                     (contract.payments.p3.amount || 0);
    const remaining = contract.value - totalPaid;
    return { totalPaid, remaining };
  }
}

// ================ AUTENTICAÇÃO ================
class AuthService {
  static requestVerification(onSuccess, onFail = () => {}) {
    const code = prompt("Para realizar esta ação, por favor, insira o código de verificação:");
    
    if (code === CONFIG.VERIFICATION_CODE) {
      isAuthenticated = true;
      onSuccess();
    } else if (code !== null) {
      alert('Código de verificação incorreto!');
      onFail();
    } else {
      onFail();
    }
  }
  
  static requireAuthentication(onSuccess) {
    if (isAuthenticated) {
      onSuccess();
    } else {
      this.requestVerification(onSuccess);
    }
  }
}

// ================ PERSISTÊNCIA ================
class DataManager {
  static save() {
    try {
      localStorage.setItem(CONFIG.LOCAL_STORAGE_KEY, JSON.stringify(state));
      calculationCache.clear();
      console.log('Dados salvos com sucesso');
    } catch (error) {
      console.error('Erro ao salvar dados:', error);
      alert('Erro ao salvar dados. Verifique o espaço disponível.');
    }
  }
  
  static load() {
    try {
      const data = localStorage.getItem(CONFIG.LOCAL_STORAGE_KEY);
      
      if (data) {
        state = JSON.parse(data);
        
        // Migração de dados antigos
        this.migrateOldData();
        
        // Garantir estrutura correta
        this.ensureDataStructure();
        
        console.log('Dados carregados com sucesso');
      } else {
        this.createDefaultData();
      }
    } catch (error) {
      console.error('Erro ao carregar dados:', error);
      alert('Erro ao carregar dados. Usando dados padrão.');
      this.createDefaultData();
    }
  }
  
  static migrateOldData() {
    // Migrar clientes
    state.clients.forEach(client => {
      if (client.situacao === undefined) {
        client.situacao = 'A';
      }
      if (client.situationChangeDate === undefined) {
        client.situationChangeDate = null;
      }
    });
    
    // Migrar pagamentos
    for (const clientId in state.payments) {
      ['p1', 'p2', 'p3'].forEach(p => {
        if (state.payments[clientId][p] === undefined) {
          state.payments[clientId][p] = { amount: 0, date: null };
        } else if (typeof state.payments[clientId][p] === 'number') {
          state.payments[clientId][p] = { 
            amount: state.payments[clientId][p], 
            date: null 
          };
        }
      });
    }
    
    // Migrar contratos
    for (const contractId in state.contracts) {
      ['p1', 'p2', 'p3'].forEach(p => {
        if (state.contracts[contractId].payments[p] === undefined) {
          state.contracts[contractId].payments[p] = { amount: 0, date: null };
        }
      });
    }
    
    // Garantir ordem dos recibos
    if (!state.receiptOrder || !Array.isArray(state.receiptOrder) || state.receiptOrder.length === 0) {
      state.receiptOrder = [10, 16, 113, 42, 21, 23, 15, 72, 76, 65, 30, 55, 52, 94, 83, 116, 51, 48, 100, 88, 118, 114, 33, 121, 7, 13, 102, 95, 111, 133, 99, 108, 126, 124, 110, 130, 67, 71, 29, 50, 112, 97, 117, 120, 92, 107, 77, 63, 6, 2, 68, 1, 73, 17, 25, 9, 132, 20, 69, 11, 134, 98, 104, 62, 82, 128, 37, 93, 57, 119, 18, 24, 125, 90, 129, 8, 3, 26, 58, 61, 80, 137, 44];
    }
  }
  
  static ensureDataStructure() {
    if (!state.clients) state.clients = [];
    if (!state.invoices) state.invoices = {};
    if (!state.payments) state.payments = {};
    if (!state.contracts) state.contracts = {};
    if (!state.receiptOrder) state.receiptOrder = [];
  }
  
  static createDefaultData() {
    state = {
      clients: [
        { id: 1, name: 'António Luís', contact: '841234567', connectionDate: '2023-01-15', situacao: 'A', situationChangeDate: null },
        { id: 2, name: 'Elias Manue', contact: '867654321', connectionDate: '2023-02-20', situacao: 'A', situationChangeDate: null },
        { id: 3, name: 'Alberto', contact: '829876543', connectionDate: '2023-03-10', situacao: 'F', situationChangeDate: '2023-05-01T10:00:00.000Z' }
      ],
      invoices: {
        1: { prevReading: 5, currentReading: 15, debt: 0, customAmount: null },
        2: { prevReading: 6, currentReading: 26, debt: 150, customAmount: null },
        3: { prevReading: 7, currentReading: 7, debt: 525, customAmount: null }
      },
      payments: {
        1: { p1: { amount: 375, date: '2025-05-26T10:00:00.000Z' }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } },
        2: { p1: { amount: 600, date: '2025-05-26T11:00:00.000Z' }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } },
        3: { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } }
      },
      contracts: {},
      receiptOrder: [10, 16, 113, 42, 21, 23, 15, 72, 76, 65, 30, 55, 52, 94, 83, 116, 51, 48, 100, 88, 118, 114, 33, 121, 7, 13, 102, 95, 111, 133, 99, 108, 126, 124, 110, 130, 67, 71, 29, 50, 112, 97, 117, 120, 92, 107, 77, 63, 6, 2, 68, 1, 73, 17, 25, 9, 132, 20, 69, 11, 134, 98, 104, 62, 82, 128, 37, 93, 57, 119, 18, 24, 125, 90, 129, 8, 3, 26, 58, 61, 80, 137, 44]
    };
  }
  
  static exportDataToFile() {
    AuthService.requestVerification(() => {
      try {
        const dataStr = JSON.stringify(state, null, 2);
        const blob = new Blob([dataStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const today = new Date().toISOString().slice(0, 10);
        a.download = `backup_gestao_aguas_${today}.json`;
        
        document.body.appendChild(a);
        a.click();
        
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        alert('Backup dos dados exportado com sucesso!');
      } catch (error) {
        console.error('Erro ao exportar dados:', error);
        alert('Ocorreu um erro ao tentar exportar os dados.');
      }
    });
  }
  
  static importDataFromFile(event) {
    AuthService.requireAuthentication(() => {
      const file = event.target.files[0];
      if (!file) return;
      
      if (!confirm('Tem a certeza que deseja importar este ficheiro? Esta ação irá substituir TODOS os dados atuais e não pode ser desfeita.')) {
        event.target.value = null;
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const content = e.target.result;
          const importedState = JSON.parse(content);
          
          if (importedState.clients && importedState.invoices && importedState.payments && importedState.contracts) {
            state = importedState;
            DataManager.migrateOldData();
            DataManager.save();
            UIManager.renderAllTables();
            alert('Dados importados com sucesso!');
          } else {
            throw new Error('Estrutura de dados inválida no ficheiro.');
          }
        } catch (error) {
          console.error('Erro ao importar o ficheiro:', error);
          alert('Erro: O ficheiro selecionado não é um ficheiro de backup válido ou está corrompido.');
        } finally {
          event.target.value = null;
        }
      };
      
      reader.onerror = function() {
        alert('Ocorreu um erro ao ler o ficheiro.');
        event.target.value = null;
      };
      
      reader.readAsText(file);
    });
  }
  
  static importInvoiceDataFromFile(event) {
    AuthService.requireAuthentication(() => {
      const file = event.target.files[0];
      if (!file) return;
      
      // Verificar extensão do ficheiro
      const fileName = file.name.toLowerCase();
      const isTXT = fileName.endsWith('.txt');
      const isCSV = fileName.endsWith('.csv');
      
      if (!isTXT && !isCSV) {
        alert('Formato de ficheiro não suportado. Por favor, selecione um ficheiro .txt ou .csv.');
        event.target.value = null;
        return;
      }
      
      if (!confirm('Tem a certeza que deseja importar este ficheiro de leituras? Esta ação irá atualizar as leituras atuais dos clientes.')) {
        event.target.value = null;
        return;
      }
      
      const reader = new FileReader();
      
      reader.onload = function(e) {
        try {
          const content = e.target.result;
          const lines = content.split('\n');
          let importedCount = 0;
          let errorCount = 0;
          let skippedClients = 0;
          let skippedHeader = false;
          
          // Para armazenar mensagens detalhadas de erro
          const errorMessages = [];
          const skippedMessages = [];
          
          for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineNumber = i + 1;
            
            if (line.trim() === '') continue;
            
            // Detectar separador
            const separator = isTXT ? ';' : ',';
            
            // Limpar linha
            const cleanLine = line.trim().replace(/["']/g, '');
            let parts = cleanLine.split(separator);
            
            // Tentar com tabulação se necessário
            if (parts.length < 3) {
              const tabParts = cleanLine.split('\t');
              if (tabParts.length >= 3) {
                parts = tabParts;
              }
            }
            
            // VERIFICAÇÃO: Só importar se tiver pelo menos 3 valores
            if (parts.length < 3) {
              errorMessages.push(`Linha ${lineNumber}: Formato inválido - menos de 3 valores encontrados.`);
              errorCount++;
              continue;
            }
            
            // Pular cabeçalho na primeira linha
            if (!skippedHeader && isNaN(Utils.parseNumber(parts[0]))) {
              skippedHeader = true;
              console.log('Cabeçalho detectado e ignorado:', line);
              continue;
            }
            
            const clientId = parseInt(parts[0].trim());
            const totalM3 = Utils.parseNumber(parts[1]);
            const totalValue = Utils.parseNumber(parts[2]);
            
            if (isNaN(clientId) || clientId <= 0) {
              errorMessages.push(`Linha ${lineNumber}: ID de cliente inválido (${parts[0]})`);
              errorCount++;
              continue;
            }
            
            // Verificar se o cliente existe
            const client = state.clients.find(c => c.id === clientId);
            if (!client) {
              errorMessages.push(`Linha ${lineNumber}: Cliente com ID ${clientId} não encontrado`);
              errorCount++;
              continue;
            }
            
            // VERIFICAÇÃO: Se a situação do cliente for F, ignorar
            if (client.situacao === 'F') {
              skippedMessages.push(`Cliente ${clientId} ignorado: Situação Fechado`);
              skippedClients++;
              continue;
            }
            
            // Verificar se a leitura importada é menor que a leitura anterior do site
            const currentInvoice = state.invoices[clientId] || { 
              prevReading: 0, 
              currentReading: 0, 
              debt: 0, 
              customAmount: null 
            };
            const sitePreviousReading = currentInvoice.currentReading || 0;
            
            if (totalM3 < sitePreviousReading) {
              skippedMessages.push(`Cliente ${clientId} ignorado: Leitura importada (${totalM3}) menor que a leitura anterior (${sitePreviousReading})`);
              skippedClients++;
              continue;
            }
            
            // VERIFICAÇÃO: Se já tem leitura atual e é igual à importada, ignorar
            if (totalM3 === sitePreviousReading) {
              skippedMessages.push(`Cliente ${clientId} ignorado: Leitura já existe (${totalM3})`);
              skippedClients++;
              continue;
            }
            
            // Atualizar fatura
            if (!state.invoices[clientId]) {
              state.invoices[clientId] = { 
                prevReading: 0, 
                currentReading: 0, 
                debt: 0, 
                customAmount: null 
              };
            }
            
            // Manter a dívida atual, não zerar
            const currentDebt = currentInvoice.debt || 0;
            
            // Preservar a leitura anterior do site
            const prevReading = sitePreviousReading;
            
            if (totalValue > 0) {
              // Tem valor total no arquivo - usar valor total diretamente
              state.invoices[clientId] = {
                prevReading: prevReading,
                currentReading: totalM3,
                debt: currentDebt, // Manter dívida atual
                customAmount: totalValue // Usar valor total do arquivo
              };
            } else {
              // Não tem valor total no arquivo - calcular usando leitura
              const consumption = Math.max(0, totalM3 - prevReading);
              let tariff = 0;
              
              if (client.situacao === 'A') {
                // Cliente Aberto: calcular tarifa normal
                if (consumption > 0) {
                  tariff = consumption <= CONFIG.TARIFAS.LIMITE_CONSUMO_MINIMO 
                    ? CONFIG.TARIFAS.CONSUMO_MINIMO 
                    : consumption * CONFIG.TARIFAS.VALOR_M3;
                } else if (totalM3 === prevReading) {
                  // Consumo zero: aplicar consumo mínimo
                  tariff = CONFIG.TARIFAS.CONSUMO_MINIMO;
                }
              } else if (client.situacao === 'N') {
                // Cliente Não: usar dívida atual
                tariff = currentDebt;
              }
              
              state.invoices[clientId] = {
                prevReading: prevReading,
                currentReading: totalM3,
                debt: currentDebt, // Manter dívida atual
                customAmount: null // Deixar cálculo normal
              };
            }
            
            importedCount++;
          }
          
          DataManager.save();
          UIManager.renderInvoicesTable();
          UIManager.renderPaymentsTable();
          
          // Montar mensagem detalhada
          let message = `Importação concluída!\n\n`;
          message += `✅ ${importedCount} clientes atualizados.\n`;
          message += `⏭️ ${skippedClients} clientes ignorados.\n`;
          message += `❌ ${errorCount} erros encontrados.\n\n`;
          
          if (skippedMessages.length > 0) {
            message += `Clientes ignorados:\n`;
            if (skippedMessages.length <= 5) {
              skippedMessages.forEach(msg => message += `  • ${msg}\n`);
            } else {
              message += `  • ${skippedMessages.slice(0, 5).join('\n  • ')}\n`;
              message += `  • ... e mais ${skippedMessages.length - 5} clientes\n`;
            }
            message += `\n`;
          }
          
          if (errorMessages.length > 0) {
            message += `Erros encontrados:\n`;
            if (errorMessages.length <= 5) {
              errorMessages.forEach(msg => message += `  • ${msg}\n`);
            } else {
              message += `  • ${errorMessages.slice(0, 5).join('\n  • ')}\n`;
              message += `  • ... e mais ${errorMessages.length - 5} erros\n`;
            }
          }
          
          alert(message);
          
        } catch (error) {
          console.error('Erro ao importar o ficheiro:', error);
          alert(`Erro: O ficheiro selecionado não está no formato correto.\n\nDetalhes:\n${error.message}\n\nFormatos aceites:\n- TXT: número_cliente;leitura_atual;valor_total\n- CSV: número_cliente,leitura_atual,valor_total\n\nNota: Linhas com menos de 3 valores serão ignoradas.`);
        } finally {
          event.target.value = null;
        }
      };
      
      reader.onerror = function() {
        alert('Ocorreu um erro ao ler o ficheiro.');
        event.target.value = null;
      };
      
      reader.readAsText(file, 'UTF-8');
    });
  }
  
  static exportReadingsToCSV() {
    AuthService.requestVerification(() => {
      try {
        let csvContent = "ID Cliente;Nome;Leitura Anterior;Leitura Atual;Consumo (m³);Dívida;Valor a Pagar\n";
        
        state.clients.forEach(client => {
          const invoice = state.invoices[client.id] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
          const { consumption, totalToPay } = Calculator.calculateInvoice(client.id, invoice, client.situacao);
          
          const row = [
            client.id,
            `"${client.name}"`,
            invoice.prevReading || 0,
            invoice.currentReading || 0,
            consumption,
            (invoice.debt || 0).toFixed(2).replace('.', ','),
            totalToPay.toFixed(2).replace('.', ',')
          ].join(';');
          
          csvContent += row + "\n";
        });
        
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        
        const today = new Date().toISOString().slice(0, 10);
        a.download = `leituras_aguas_${today}.csv`;
        
        document.body.appendChild(a);
        a.click();
        
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
        
        alert('Leituras exportadas em formato CSV com sucesso!');
        
      } catch (error) {
        console.error('Erro ao exportar leituras:', error);
        alert('Ocorreu um erro ao tentar exportar as leituras.');
      }
    });
  }
}

// ================ INTERFACE DO UTILIZADOR ================
class UIManager {
  static renderAllTables() {
    this.renderClientsTable();
    this.renderInvoicesTable();
    this.renderPaymentsTable();
    this.renderContractsTable();
  }
  
  static renderClientsTable() {
    DOM.clientsTableBody.innerHTML = '';
    const searchTerm = DOM.clientSearchClients.value.toLowerCase();
    
    const filteredClients = state.clients.filter(client => {
      const matchesName = client.name.toLowerCase().includes(searchTerm);
      const matchesId = String(client.id).includes(searchTerm);
      return matchesName || matchesId;
    });
    
    filteredClients.forEach(client => {
      const row = document.createElement('tr');
      row.dataset.clientId = client.id;
      const situacao = client.situacao || 'A';
      const situationChangeDate = client.situationChangeDate || '';
      const formattedDate = situationChangeDate ? Utils.formatDateForDisplay(situationChangeDate) : '';
      
      row.innerHTML = `
        <td>${client.id}</td>
        <td>${client.name}</td>
        <td>+258 ${client.contact}</td>
        <td>${Utils.formatDate(client.connectionDate)}</td>
        <td>
          <select class="situacao-select" data-client-id="${client.id}" title="A: Aberto, F: Fechada, N: Não">
            <option value="A" ${situacao === 'A' ? 'selected' : ''}>A</option>
            <option value="F" ${situacao === 'F' ? 'selected' : ''}>F</option>
            <option value="N" ${situacao === 'N' ? 'selected' : ''}>N</option>
          </select>
        </td>
        <td>${formattedDate}</td>
        <td class="actions-cell">
          <button class="action-toggle btn-secondary">Ações</button>
          <div class="action-buttons">
            <button class="btn-warning" data-action="edit" data-id="${client.id}">Editar</button>
            <button class="btn-danger" data-action="delete" data-id="${client.id}">Remover</button>
            <button class="btn-secondary" data-action="reset-meter" data-id="${client.id}" title="Zerar leituras para simular troca de contador">Trocar Contador</button>
          </div>
        </td>
      `;
      DOM.clientsTableBody.appendChild(row);
    });
  }
  
  static renderInvoicesTable() {
    DOM.invoicesTableBody.innerHTML = '';
    const searchTerm = DOM.invoiceSearch.value.toLowerCase();
    
    state.clients.forEach(client => {
      const invoice = state.invoices[client.id] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
      const { consumption, totalToPay } = Calculator.calculateInvoice(client.id, invoice, client.situacao);
      const isFechadoOuNao = client.situacao === 'F' || client.situacao === 'N';
      
      const prevReadingAttrs = isFechadoOuNao 
        ? `class="read-only-input" title="Não editável (Situação: ${client.situacao})"` 
        : '';
      const currentReadingAttrs = isFechadoOuNao 
        ? `class="read-only-input" title="Não editável (Situação: ${client.situacao})"`
        : `contenteditable="true" title="Insira a nova leitura aqui"`;
      
      const matchesName = client.name.toLowerCase().includes(searchTerm);
      const matchesId = String(client.id).includes(searchTerm);
      
      if (matchesName || matchesId) {
        const debtValue = Utils.parseNumber(invoice.debt);
        const debtClass = debtValue > 1124 ? 'text-danger' : '';
        
        const row = document.createElement('tr');
        row.innerHTML = `
          <td>${client.id}</td>
          <td>${client.name}</td>
          <td data-client-id="${client.id}" data-field="prevReading" ${prevReadingAttrs}>${invoice.prevReading || 0}</td>
          <td data-client-id="${client.id}" data-field="currentReading" ${currentReadingAttrs}>${invoice.currentReading || ''}</td>
          <td class="read-only-input">${consumption}</td>
          <td contenteditable="true" data-client-id="${client.id}" data-field="debt" class="${debtClass}">${debtValue.toFixed(2)}</td>
          <td contenteditable="true" data-client-id="${client.id}" data-field="customAmount" title="Pode ser editado manualmente">${totalToPay.toFixed(2)}</td>
        `;
        DOM.invoicesTableBody.appendChild(row);
      }
    });
  }
  
  static renderPaymentsTable() {
    DOM.paymentsTableBody.innerHTML = '';
    const searchTerm = DOM.clientSearchPayments.value.toLowerCase();
    
    const filteredClients = state.clients.filter(client => {
      const matchesName = client.name.toLowerCase().includes(searchTerm);
      const matchesId = String(client.id).includes(searchTerm);
      return matchesName || matchesId;
    });
    
    filteredClients.forEach(client => {
      const invoice = state.invoices[client.id] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
      const { totalToPay } = Calculator.calculateInvoice(client.id, invoice, client.situacao);
      const payment = state.payments[client.id] || { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
      const totalPaid = Calculator.calculatePayments(payment);
      const remaining = totalToPay - totalPaid;
      
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>${client.id}</td>
        <td>${client.name}</td>
        <td class="read-only-input">${totalToPay.toFixed(2)}</td>
        <td class="payment-cell" data-client-id="${client.id}" data-field="p1">
          <div class="payment-cell-value" title="Clique para editar">${payment.p1.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(payment.p1.date)}</span>
          ${payment.p1.amount > 0 ? '<button class="btn-receipt" data-action="generate-payment-receipt" data-field="p1">Recibo</button>' : ''}
        </td>
        <td class="payment-cell" data-client-id="${client.id}" data-field="p2">
          <div class="payment-cell-value" title="Clique para editar">${payment.p2.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(payment.p2.date)}</span>
          ${payment.p2.amount > 0 ? '<button class="btn-receipt" data-action="generate-payment-receipt" data-field="p2">Recibo</button>' : ''}
        </td>
        <td class="payment-cell" data-client-id="${client.id}" data-field="p3">
          <div class="payment-cell-value" title="Clique para editar">${payment.p3.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(payment.p3.date)}</span>
          ${payment.p3.amount > 0 ? '<button class="btn-receipt" data-action="generate-payment-receipt" data-field="p3">Recibo</button>' : ''}
        </td>
        <td class="${remaining > 0 ? 'text-danger' : 'text-success'} read-only-input">${remaining.toFixed(2)}</td>
      `;
      DOM.paymentsTableBody.appendChild(row);
    });
  }
  
  static renderContractsTable() {
    DOM.contractsTableBody.innerHTML = '';
    Object.keys(state.contracts).forEach(contractId => {
      const contract = state.contracts[contractId];
      const client = state.clients.find(c => c.id == contract.clientId);
      if (!client) return;
      
      const { totalPaid, remaining } = Calculator.calculateContractTotals(contract);
      
      const row = document.createElement('tr');
      
      row.innerHTML = `
        <td>${contract.id}</td>
        <td>${client.id}</td>
        <td>${client.name}</td>
        <td>${contract.value.toFixed(2)}</td>
        <td class="payment-cell" data-contract-id="${contractId}" data-field="p1">
          <div class="payment-cell-value" title="Clique para editar">${contract.payments.p1.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(contract.payments.p1.date)}</span>
        </td>
        <td class="payment-cell" data-contract-id="${contractId}" data-field="p2">
          <div class="payment-cell-value" title="Clique para editar">${contract.payments.p2.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(contract.payments.p2.date)}</span>
        </td>
        <td class="payment-cell" data-contract-id="${contractId}" data-field="p3">
          <div class="payment-cell-value" title="Clique para editar">${contract.payments.p3.amount || 0}</div>
          <span class="payment-date">${Utils.formatDate(contract.payments.p3.date)}</span>
        </td>
        <td class="${remaining > 0 ? 'text-danger' : 'text-success'} read-only-input">${remaining.toFixed(2)}</td>
        <td class="actions-cell">
          <button class="btn-warning" data-action="generate-contract-receipt" data-id="${contractId}">Recibo</button>
          <button class="btn-danger" data-action="delete-contract" data-id="${contractId}">Remover</button>
        </td>
      `;
      DOM.contractsTableBody.appendChild(row);
    });
  }
  
  static renderReceipts(startId = null, endId = null) {
    DOM.receiptsContainer.innerHTML = '';
    const generatedInvoiceNumbers = new Set();
    
    const currentDate = new Date();
    const monthName = currentDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const year = currentDate.getFullYear();
    
    const customOrder = state.receiptOrder || [];
    const customOrderSet = new Set(customOrder);
    
    const allActiveClients = state.clients.filter(client => client.situacao === 'A');
    
    const prioritizedClients = [];
    const otherClients = [];
    
    customOrder.forEach(id => {
      const client = allActiveClients.find(c => c.id === id);
      if (client) {
        prioritizedClients.push(client);
      }
    });
    
    allActiveClients.forEach(client => {
      if (!customOrderSet.has(client.id)) {
        otherClients.push(client);
      }
    });
    
    otherClients.sort((a, b) => a.id - b.id);
    let sortedClients = [...prioritizedClients, ...otherClients];
    
    let clientsToPrint = sortedClients;
    if (startId !== null && endId !== null) {
      clientsToPrint = sortedClients.filter(client => client.id >= startId && client.id <= endId);
    }
    
    if (clientsToPrint.length === 0 && (startId !== null || endId !== null)) {
      DOM.receiptsContainer.innerHTML = '<p>Nenhuma factura de cliente ATIVO encontrada para o intervalo de IDs especificado.</p>';
      return;
    } else if (clientsToPrint.length === 0) {
      DOM.receiptsContainer.innerHTML = '<p>Nenhum cliente ativo para gerar facturas.</p>';
      return;
    }
    
    clientsToPrint.forEach((client, index) => {
      const invoiceNumber = Utils.generateRandomInvoiceNumber(generatedInvoiceNumbers);
      generatedInvoiceNumbers.add(invoiceNumber);
      
      const invoice = state.invoices[client.id] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
      const payment = state.payments[client.id] || { p1: { amount: 0 }, p2: { amount: 0 }, p3: { amount: 0 } };
      const { totalToPay } = Calculator.calculateInvoice(client.id, invoice, client.situacao);
      const totalPaid = Calculator.calculatePayments(payment);
      
      const valorEmFalta = totalToPay - totalPaid;
      const debtForReceipt = valorEmFalta;
      const debtClassForReceipt = debtForReceipt > 1124 ? 'text-danger' : '';
      
      const prevReadingForReceipt = invoice.prevReading || 0;
      const counterNumber = String(client.id).padStart(3, '0');
      
      const receiptHTML = `
      <div class="receipt">
        <div class="receipt-header">
          <h4>ÁGUA PAZ (TEMBE)</h4>
          <p>COMPROVATIVO DE PAGAMENTO PELO CONSUMO DE ÁGUA</p>
        </div>
        <div class="receipt-body">
          <p>
            <strong>FACTURA Nº</strong><span class="data-field data-field-blue">${invoiceNumber}</span>
            <strong>MÊS DE</strong><span class="data-field data-field-blue">${monthName}</span>
            <strong>ANO</strong><span class="data-field data-field-blue">${year}</span>
            <strong>CONTADOR Nº</strong><span class="data-field data-field-blue">${counterNumber}</span>
          </p>
          <p>
            Para efeitos e fins julgados convenientes, declaramos que a fatura do(a) Sr(a).<span class="data-field data-field-blue">${client.name}</span>
            residente na casa nº <span class="data-field">___________</span>
            tem de pagar a quantia de <span class="data-field">__________</span> MZN
            o valor do consumo mínimo é de 375MZN.
          </p>
          <table>
            <thead>
              <tr>
                <th>LEITURA ANTERIOR</th>
                <th>LEITURA MENSAL</th>
                <th>LEITURA TOTAL</th>
                <th>VALOR POR M³</th>
                <th colspan="2">VALOR A PAGAR</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td><span class="data-field">${prevReadingForReceipt}</span></td>
                <td><span class="data-field"></span></td>
                <td><span class="data-field"></span></td>
                <td><span class="data-field">75.00 MZN</span></td>
                <td>Leitura</td>
                <td><span class="data-field"></span> MZN</td>
              </tr>
              <tr>
                <td colspan="4"></td>
                <td>Dívida</td>
                <td><span class="data-field ${debtClassForReceipt}">${debtForReceipt.toFixed(2)} MZN</span></td>
              </tr>
              <tr>
                <td colspan="4"></td>
                <td><strong>Total</strong></td>
                <td><strong><span class="data-field"></span> MZN</strong></td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>`;
      DOM.receiptsContainer.innerHTML += receiptHTML;
      
      const position = index + 1;
      const isLastOverall = position === clientsToPrint.length;
      
      if (!isLastOverall && (position % 3 !== 0)) {
        DOM.receiptsContainer.innerHTML += '<hr class="invoice-divider">';
      }
    });
  }
}

// ================ RECIBOS E NUMERAIS ================
class ReceiptManager {
  static numberToWords(num) {
    const units = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove'];
    const teens = ['dez', 'onze', 'treze', 'catorze', 'quinze', 'dezasseis', 'dezassete', 'dezoito', 'dezanove'];
    const tens = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
    const hundreds = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
    
    function convertGroup(n) {
      if (n === 0) return '';
      if (n < 10) return units[n];
      if (n >= 10 && n < 20) {
        if (n === 10) return 'dez';
        if (n === 11) return 'onze';
        if (n === 12) return 'doze';
        return teens[n - 10];
      }
      if (n >= 20 && n < 100) {
        return tens[Math.floor(n / 10)] + (n % 10 === 0 ? '' : ' e ' + units[n % 10]);
      }
      if (n >= 100 && n < 1000) {
        if (n === 100) return 'cem';
        return hundreds[Math.floor(n / 100)] + (n % 100 === 0 ? '' : ' e ' + convertGroup(n % 100));
      }
      return '';
    }
    
    if (num === 0) return 'zero';
    
    let integerPart = Math.floor(num);
    let decimalPart = Math.round((num - integerPart) * 100);
    
    let result = '';
    let hundredsGroup = Math.floor(integerPart % 1000);
    let thousandsGroup = Math.floor((integerPart / 1000) % 1000);
    let millionsGroup = Math.floor((integerPart / 1000000) % 1000);
    let billionsGroup = Math.floor(integerPart / 1000000000);
    
    if (billionsGroup > 0) {
      result += convertGroup(billionsGroup) + ' mil milhões ';
    }
    if (millionsGroup > 0) {
      result += convertGroup(millionsGroup) + (millionsGroup === 1 ? ' milhão ' : ' milhões ');
    }
    if (thousandsGroup > 0) {
      result += (thousandsGroup === 1 && millionsGroup === 0) ? 'mil ' : convertGroup(thousandsGroup) + ' mil ';
    }
    if (hundredsGroup > 0 || (integerPart === 0 && decimalPart === 0)) {
      result += convertGroup(hundredsGroup);
    }
    
    let fullResult = result.trim();
    
    if (integerPart === 1 && !fullResult.includes("milhão") && !fullResult.includes("mil milhões")) {
      fullResult += ' Metical';
    } else if (integerPart > 0) {
      fullResult += ' Meticais';
    }
    
    if (decimalPart > 0) {
      const decimalWords = convertGroup(decimalPart);
      const separator = fullResult ? ' e ' : '';
      fullResult += separator + decimalWords + (decimalPart === 1 ? ' centavo' : ' centavos');
    }
    
    return fullResult.charAt(0).toUpperCase() + fullResult.slice(1);
  }
  
  static generateUniqueBinarySignature() {
    let binaryString;
    do {
      binaryString = '';
      for (let i = 0; i < 25; i++) {
        binaryString += Math.round(Math.random());
      }
    } while (generatedBinarySignatures.has(binaryString));
    generatedBinarySignatures.add(binaryString);
    return binaryString;
  }
  
  static generateReceipt(clientId, field = null) {
    const client = state.clients.find(c => c.id == clientId);
    if (!client) {
      alert("Cliente não encontrado.");
      return;
    }
    
    const payment = state.payments[clientId] || { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
    const invoice = state.invoices[clientId] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
    
    // Se não especificar o campo, encontrar o último pagamento com valor
    if (!field) {
      if (payment.p3.amount > 0 && payment.p3.date) {
        field = 'p3';
      } else if (payment.p2.amount > 0 && payment.p2.date) {
        field = 'p2';
      } else if (payment.p1.amount > 0 && payment.p1.date) {
        field = 'p1';
      } else {
        alert("Não existe nenhum pagamento registado para este cliente.");
        return;
      }
    }
    
    const lastPayment = payment[field];
    if (!lastPayment || lastPayment.amount === 0) {
      alert("Não existe nenhum pagamento registado para este cliente.");
      return;
    }
    
    const lastPaymentAmount = lastPayment.amount;
    const lastPaymentDate = lastPayment.date ? new Date(lastPayment.date) : new Date();
    
    // Calcular o valor total a pagar e o que já foi pago até AGORA (incluindo este pagamento)
    const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, client.situacao);
    const totalPaid = Calculator.calculatePayments(payment); // Soma de todos os pagamentos
    
    // Valor que faltava ANTES deste pagamento específico
    const paidBeforeThis = totalPaid - lastPaymentAmount;
    const valorEmFaltaAntes = Math.max(0, totalToPay - paidBeforeThis);
    
    const receiptDate = lastPaymentDate;
    const day = String(receiptDate.getDate()).padStart(2, '0');
    const receiptMonthText = receiptDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const fullYear = String(receiptDate.getFullYear());
    
    const invoiceDate = new Date();
    invoiceDate.setDate(1);
    invoiceDate.setMonth(invoiceDate.getMonth() - 1);
    const invoiceMonthName = invoiceDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    
    const counterNumber = String(client.id).padStart(3, '0');
    const amountInWords = this.numberToWords(lastPaymentAmount);
    
    // **LÓGICA CORRIGIDA PARA A MENSAGEM DO RECIBO - BASEADA APENAS NO ÚLTIMO PAGAMENTO**
    let receiptText = '';
    
    // Caso 1: Não tinha valor a pagar (0 ou negativo) e fez pagamento
    if (valorEmFaltaAntes <= 0 && lastPaymentAmount > 0) {
        // Valor que faltava era 0 e cliente faz pagamento adiantado
        receiptText = 'Referente ao crédito para futura(s) fatura(s) de água, motivo pela qual passamos o presente recibo.';
    } 
    // Caso 2: Cliente pagou mais do que faltava com este pagamento específico
    else if (lastPaymentAmount > valorEmFaltaAntes && valorEmFaltaAntes > 0) {
        // Cliente pagou a mais do que faltava
        const pagamentoFatura = valorEmFaltaAntes;
        const credito = lastPaymentAmount - valorEmFaltaAntes;
        receiptText = `Da qual ${pagamentoFatura.toFixed(2)} MT é referente ao pagamento da fatura do mês de ${invoiceMonthName} e ${credito.toFixed(2)} MT créditos \n para futura(s) faturas de água. motivo pela qual passamos o presente recibo.`;
    }
    // Caso 3: Pagamento incompleto (ainda falta valor após este pagamento)
    else if (lastPaymentAmount < valorEmFaltaAntes && lastPaymentAmount > 0) {
        // Pagou incompleto - ainda falta valor
        const valorEmFaltaDepois = valorEmFaltaAntes - lastPaymentAmount;
        receiptText = `à fatura de consumo de água do mês de ${invoiceMonthName}  tem remanescente o valor ${valorEmFaltaDepois.toFixed(2)} MT. \n motivo pela qual passamos o presente recibo.`;
    }
    // Caso 4: Pagamento exato do que faltava
    else if (lastPaymentAmount === valorEmFaltaAntes && lastPaymentAmount > 0) {
        // Pagamento exato do que faltava
        receiptText = `À fatura de consumo de água do mês de ${invoiceMonthName}, motivo pelo qual passamos o presente recibo.`;
    }
    // Caso 5: Outras situações
    else {
        // Pagamento normal
        receiptText = `À fatura de consumo de água do mês de ${invoiceMonthName}, motivo pelo qual passamos o presente recibo.`;
    }
    
    const fillWithUnderscores = (text, maxLength) => {
      const currentLength = String(text).length;
      if (currentLength >= maxLength) return String(text);
      return String(text) + '_'.repeat(maxLength - currentLength);
    };
    
    const getUnderlineClass = (text, maxLength) => {
      return String(text).length >= maxLength ? 'no-underline' : '';
    };
    
    const machineSignature = this.generateUniqueBinarySignature();
    
    const createSingleReceiptHTML = () => {
      return `
      <div class="recibo-popup">
        <div class="cabecalho">
          <div class="agua-paz">ÁGUA PAZ (TEMBE)</div>
          <div class="recibo-num"> <span class="fill-underline ${getUnderlineClass(day, 2)} data-field-blue">${fillWithUnderscores(day, 2)}</span> DE <span class="fill-underline no-underline-month ${getUnderlineClass(receiptMonthText, 10)} data-field-blue">${fillWithUnderscores(receiptMonthText, 10)}</span> DE <span class="fill-underline ${getUnderlineClass(fullYear, 4)} data-field-blue">${fillWithUnderscores(fullYear, 4)}</span> <br /><br />PAGO <span class="fill-underline ${getUnderlineClass(lastPaymentAmount.toFixed(2), 10)} data-field-blue">${fillWithUnderscores(lastPaymentAmount.toFixed(2), 10)}</span> MT</div>
        </div>
        
        <div class="linha">Recebemos do Exmo Sr.(a). <span class="fill-underline ${getUnderlineClass(client.name, 40)} data-field-blue">${fillWithUnderscores(client.name, 40)}</span>, portador do contador : <span class="fill-underline ${getUnderlineClass(counterNumber, 5)} data-field-blue">${fillWithUnderscores(counterNumber, 5)}</span></div>
        <div class="linha">a importância de <span class="fill-underline ${getUnderlineClass(amountInWords, 60)} data-field-blue" style="width: 70%;">${fillWithUnderscores(amountInWords, 60)}</span></div>
        <div class="linha"><span class="fill-underline no-underline" style="width: 98%;"></span></div>
        <div class="linha">referente <span class="fill-underline ${getUnderlineClass(receiptText, 100)} data-field-blue">${receiptText}</span></div>
        
        <div class="linha"></div>
        
        <div class="receipt-top-info">
          <span class="payment-form-header">Forma de pagamento:</span>
          <span class="assinatura-header"></span>
        </div>
        
        <div class="assinatura-checklist-container">
          <div class="checklist">
            <label><input type="checkbox"> Cheque nº <span class="fill-underline" style="width: 15ch;"></span></label><br>
            <label><input type="checkbox"> Banco <span class="fill-underline" style="width: 18ch;"></span></label><br>
            <label><input type="checkbox"> Outros</label><br>
            <label><input type="checkbox" checked> Em numerário</label>
          </div>
          
          <div class="assinatura">
            <span class="fill-underline" style="width: 25ch;"></span>
            <img src="carimbo.png" alt="Carimbo" class="carimbo-overlay">
            <br> <br> <strong>ID DO RECIBO&nbsp;&nbsp;&nbsp;&nbsp; &nbsp; </strong> <br /> <br><span class="fill-underline no-underline data-field-yellow">${machineSignature}</span>
          </div>
        </div>
      </div>
      `;
    };
    
    const receiptTitle = `Cliente_${String(client.id).padStart(3, '0')}_${field.toUpperCase()}`;
    this.openReceiptInNewWindow(createSingleReceiptHTML(), receiptTitle);
  }
  
  static generateContractReceipt(contractId) {
    const contract = state.contracts[contractId];
    if (!contract) {
      alert("Contrato não encontrado.");
      return;
    }
    
    const client = state.clients.find(c => c.id == contract.clientId);
    if (!client) {
      alert("Cliente associado ao contrato não encontrado.");
      return;
    }
    
    const payment = contract.payments;
    const { remaining } = Calculator.calculateContractTotals(contract);
    
    let lastPaymentAmount = 0;
    let lastPaymentDate = null;
    if (payment.p3.amount > 0 && payment.p3.date) {
      lastPaymentAmount = payment.p3.amount;
      lastPaymentDate = new Date(payment.p3.date);
    } else if (payment.p2.amount > 0 && payment.p2.date) {
      lastPaymentAmount = payment.p2.amount;
      lastPaymentDate = new Date(payment.p2.date);
    } else if (payment.p1.amount > 0 && payment.p1.date) {
      lastPaymentAmount = payment.p1.amount;
      lastPaymentDate = new Date(payment.p1.date);
    }
    
    if (lastPaymentAmount === 0) {
      alert("Não existe nenhum pagamento registado para este contrato.");
      return;
    }
    
    const receiptDate = lastPaymentDate || new Date();
    const day = String(receiptDate.getDate()).padStart(2, '0');
    const receiptMonthText = receiptDate.toLocaleString('pt-BR', { month: 'long' }).toUpperCase();
    const fullYear = String(receiptDate.getFullYear());
    
    const counterNumber = String(client.id).padStart(3, '0');
    const amountInWords = this.numberToWords(lastPaymentAmount);
    
    const fillWithUnderscores = (text, maxLength) => {
      const currentLength = String(text).length;
      if (currentLength >= maxLength) return String(text);
      return String(text) + '_'.repeat(maxLength - currentLength);
    };
    
    const getUnderlineClass = (text, maxLength) => {
      return String(text).length >= maxLength ? 'no-underline' : '';
    };
    
    const machineSignature = this.generateUniqueBinarySignature();
    const valorEmFaltaClass = remaining > 0 ? 'data-field-red' : 'data-field-blue';
    
    const createSingleReceiptHTML = () => {
      const receiptText = 'à prestação do contrato de água no valor de cinco mil Meticais.';
      return `
      <div class="recibo-popup">
        <div class="cabecalho">
          <div class="agua-paz">ÁGUA PAZ (TEMBE)</div>
          <div class="recibo-num"> <span class="fill-underline ${getUnderlineClass(day, 2)} data-field-blue">${fillWithUnderscores(day, 2)}</span> DE <span class="fill-underline no-underline-month ${getUnderlineClass(receiptMonthText, 10)} data-field-blue">${fillWithUnderscores(receiptMonthText, 10)}</span> DE <span class="fill-underline ${getUnderlineClass(fullYear, 4)} data-field-blue">${fillWithUnderscores(fullYear, 4)}</span> <br /><br />PAGO <span class="fill-underline ${getUnderlineClass(lastPaymentAmount.toFixed(2), 10)} data-field-blue">${fillWithUnderscores(lastPaymentAmount.toFixed(2), 10)}</span> MT</div>
        </div>
        
        <div class="linha">Recebemos do Exmo Sr.(a). <span class="fill-underline ${getUnderlineClass(client.name, 40)} data-field-blue">${fillWithUnderscores(client.name, 40)}</span>, portador do contador : <span class="fill-underline ${getUnderlineClass(counterNumber, 5)} data-field-blue">${fillWithUnderscores(counterNumber, 5)}</span></div>
        <div class="linha">a importância de <span class="fill-underline ${getUnderlineClass(amountInWords, 60)} data-field-blue" style="width: 70%;">${fillWithUnderscores(amountInWords, 60)}</span></div>
        <div class="linha"><span class="fill-underline no-underline" style="width: 98%;"></span></div>
        <div class="linha">referente <span class="fill-underline ${getUnderlineClass(receiptText, 70)} data-field-blue">${receiptText}</span> Remanescente <span class="fill-underline ${getUnderlineClass(remaining.toFixed(2), 10)} ${valorEmFaltaClass}">${fillWithUnderscores(remaining.toFixed(2), 10)}</span> MT, motivo pelo qual passamos o presente recibo.</div>
        
        <div class="linha"></div>
        
        <div class="receipt-top-info">
          <span class="payment-form-header">Forma de pagamento:</span>
          <span class="assinatura-header"></span>
        </div>
        
        <div class="assinatura-checklist-container">
          <div class="checklist">
            <label><input type="checkbox"> Cheque nº <span class="fill-underline" style="width: 15ch;"></span></label><br>
            <label><input type="checkbox"> Banco <span class="fill-underline" style="width: 18ch;"></span></label><br>
            <label><input type="checkbox"> Outros</label><br>
            <label><input type="checkbox" checked> Em numerário</label>
          </div>
          
          <div class="assinatura">
            <span class="fill-underline" style="width: 25ch;"></span>
            <img src="carimbo.png" alt="Carimbo" class="carimbo-overlay">
            <br> <br> <strong>ID DO RECIBO&nbsp;&nbsp;&nbsp;&nbsp; &nbsp; </strong> <br /> <br><span class="fill-underline no-underline data-field-yellow">${machineSignature}</span>
          </div>
        </div>
      </div>
      `;
    };
    
    const receiptTitle = String(client.id).padStart(3, '0');
    this.openReceiptInNewWindow(createSingleReceiptHTML(), receiptTitle);
  }
  
  static openReceiptInNewWindow(htmlContent, title) {
    const safeTitle = title || 'Recibo de Pagamento';
    const newWindow = window.open('', '_blank', 'width=800,height=600');
    
    const printStyle = `
      @media print {
        body {
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          justify-content: flex-start;
          align-items: center;
          height: 29.7cm;
          width: 21cm;
          overflow: hidden;
        }
        .recibo-popup {
          width: 21cm !important;
          height: 11.8cm !important;
          margin: 0.8cm 0 0.4cm !important;
          border: 1px solid black !important;
          box-sizing: border-box !important;
          font-family: monospace !important;
          position: relative !important;
          page-break-after: auto !important;
          page-break-inside: avoid;
        }
        .receipt-divider-print {
          border: none;
          border-top: 1px dashed #999;
          margin: 0.4cm auto !important;
          width: 80% !important;
          display: block !important;
        }
      }
      
      .recibo-popup {
        width: 97%;
        height: 45%;
        border: 1px solid black;
        padding: 20px;
        box-sizing: border-box;
        font-family: monospace;
        position: relative;
      }
      
      .cabecalho {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 20px;
      }
      
      .agua-paz {
        font-size: 20px;
        font-weight: bold;
        text-transform: uppercase;
      }
      
      .recibo-num {
        font-size: 16px;
        text-align: right;
      }
      
      .linha {
        margin: 10px 0;
      }
      
      .assinatura-checklist-container {
        display: flex;
        flex-direction: column;
        justify-content: space-between;
        align-items: flex-start;
        margin-top: 30px;
      }
      
      @media (min-width: 768px) {
        .assinatura-checklist-container {
          flex-direction: row;
        }
      }
      
      .checklist, .assinatura {
        width: 100%;
        margin-bottom: 20px;
      }
      
      @media (min-width: 768px) {
        .checklist, .assinatura {
          width: 48%;
        }
      }
      
      .assinatura {
        text-align: left;
        position: relative;
        min-height: 150px; /* Garantir altura mínima para o carimbo */
      }
      
      .receipt-top-info {
        display: flex;
        justify-content: space-between;
        align-items: flex-end;
        margin-bottom: 10px;
        font-weight: bold;
      }
      
      .fill-underline {
        font-family: monospace;
        white-space: pre;
        text-decoration: none;
        display: inline-flex;
        align-items: center;
        justify-content: center;
        min-width: 50px;
        border-bottom: 1px solid black;
        box-sizing: border-box;
        padding: 0 2px;
      }
      
      .fill-underline.no-underline {
        border-bottom: none;
        text-decoration: none;
      }
      
      .data-field-blue { color: blue; }
      .data-field-red { color: red; }
      .data-field-yellow {
        color: orange;
        font-weight: bold;
        font-size: 1.05em;
      }
      
      .no-underline-month {
        text-decoration: none !important;
        border-bottom: none !important;
      }
      
      .carimbo-overlay {
        position: absolute;
        top: -4.8cm; /* MOVIDO 4cm PARA CIMA (de -0.8cm para -4.8cm) */
        right: 8.5cm; /* MOVIDO 8.5cm PARA A DIREITA (de -6.8cm para 8.5cm) */
        width: 9.7cm; /* DIMINUÍDA EM 3% DO TAMANHO TOTAL (10cm - 3% = 9.7cm) */
        height: auto;
        opacity: 0.8;
        z-index: 100; /* Valor alto para garantir que fique sobre os elementos */
        pointer-events: none; /* Permite interação com elementos abaixo */
      }
      
      /* Ajuste para impressão - posição fixa */
      @media print {
        .carimbo-overlay {
          position: absolute;
          top: -4.8cm; /* MOVIDO 4cm PARA CIMA (de -0.8cm para -4.8cm) */
          right: 8.5cm; /* MOVIDO 8.5cm PARA A DIREITA (de -6.8cm para 8.5cm) */
          width: 9.7cm; /* DIMINUÍDA EM 3% DO TAMANHO TOTAL (10cm - 3% = 9.7cm) */
          height: auto;
          opacity: 0.8;
          z-index: 100;
        }
      }
      
      @media (max-width: 768px) {
        .carimbo-overlay {
          top: -4.8cm; /* MOVIDO 4cm PARA CIMA (de -0.8cm para -4.8cm) */
          right: 8.5cm; /* MOVIDO 8.5cm PARA A DIREITA (de -6.8cm para 8.5cm) */
          width: 7.76cm; /* 8cm - 3% = 7.76cm */
        }
      }
    `;
    
    newWindow.document.open();
    newWindow.document.write(`
      <!DOCTYPE html>
      <html lang="pt">
      <head>
        <meta charset="UTF-8">
        <title>${safeTitle}</title>
        <style>${printStyle}</style>
      </head>
      <body>
        ${htmlContent}
        <hr class="receipt-divider-print">
        ${htmlContent}
        <script>
          window.onload = function() {
            window.focus();
            window.print();
          };
        </script>
      </body>
      </html>
    `);
    newWindow.document.close();
  }
}

// ================ GESTÃO DE EVENTOS ================
class EventManager {
  static init() {
    // Menu
    DOM.menuButton.addEventListener('click', () => DOM.sideMenu.classList.toggle('open'));
    
    // Autenticação
    DOM.authForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (DOM.verificationCodeInput.value === CONFIG.VERIFICATION_CODE) {
        isAuthenticated = true;
        DOM.authSection.classList.add('hidden');
        DOM.adminActions.classList.remove('hidden');
      } else {
        alert('Código de verificação incorreto!');
      }
      DOM.verificationCodeInput.value = '';
    });
    
    // Ações do administrador
    DOM.adminActions.addEventListener('click', (e) => {
      if (e.target.tagName !== 'BUTTON') return;
      const action = e.target.dataset.action;
      const view = e.target.dataset.view;
      
      if (action === 'add-client') {
        this.openClientModal();
      } else if (action === 'add-contract') {
        this.openContractModal();
      } else if (action === 'export-data') {
        DataManager.exportDataToFile();
      } else if (action === 'import-data') {
        DOM.importFileInput.click();
      }
      
      if (view) {
        DOM.views.forEach(v => v.classList.add('hidden'));
        document.getElementById(view).classList.remove('hidden');
        DOM.sideMenu.classList.remove('open');
        
        if (view === 'clients-view') UIManager.renderClientsTable();
        if (view === 'invoices-view') UIManager.renderInvoicesTable();
        if (view === 'payments-view') UIManager.renderPaymentsTable();
        if (view === 'contracts-view') UIManager.renderContractsTable();
        if (view === 'receipts-view') UIManager.renderReceipts();
      }
    });
    
    // Modal Cliente
    DOM.closeClientModalButton.addEventListener('click', () => DOM.clientModal.classList.add('hidden'));
    DOM.clientModal.addEventListener('click', (e) => {
      if (e.target === DOM.clientModal) DOM.clientModal.classList.add('hidden');
    });
    
    // Formulário Cliente
    DOM.clientForm.addEventListener('submit', (e) => this.handleClientFormSubmit(e));
    
    // Tabela Clientes
    DOM.clientsTableBody.addEventListener('click', (e) => this.handleClientsTableClick(e));
    DOM.clientsTableBody.addEventListener('change', (e) => this.handleSituacaoChange(e));
    
    // Tabela Faturas
    DOM.invoicesTableBody.addEventListener('focus', (e) => this.handleCellEdit(e), true);
    DOM.invoicesTableBody.addEventListener('blur', (e) => this.handleCellEdit(e), true);
    DOM.invoicesTableBody.addEventListener('keydown', (e) => this.handleCellEdit(e));
    
    // Tabela Pagamentos
    DOM.paymentsTableBody.addEventListener('click', (e) => this.handlePaymentsTableClick(e));
    
    // Tabela Contratos
    DOM.contractsTableBody.addEventListener('click', (e) => this.handleContractsTableClick(e));
    
    // Buscas
    DOM.clientSearchClients.addEventListener('input', Utils.debounce(() => UIManager.renderClientsTable(), 300));
    DOM.clientSearchPayments.addEventListener('input', Utils.debounce(() => UIManager.renderPaymentsTable(), 300));
    DOM.invoiceSearch.addEventListener('input', Utils.debounce(() => UIManager.renderInvoicesTable(), 300));
    
    // Importação/Exportação
    DOM.importFileInput.addEventListener('change', (e) => DataManager.importDataFromFile(e));
    DOM.importInvoiceFileInput.addEventListener('change', (e) => DataManager.importInvoiceDataFromFile(e));
    
    // Recibos
    DOM.newMonthButton.addEventListener('click', () => this.handleNewMonth());
    DOM.editReceiptOrderButton.addEventListener('click', () => this.handleEditReceiptOrder());
    DOM.generateReceiptsByRangeButton.addEventListener('click', () => this.handleGenerateReceiptsByRange());
    
    // Modal Contrato
    DOM.closeContractModalButton.addEventListener('click', () => DOM.contractModal.classList.add('hidden'));
    DOM.contractModal.addEventListener('click', (e) => {
      if (e.target === DOM.contractModal) DOM.contractModal.classList.add('hidden');
    });
    DOM.contractForm.addEventListener('submit', (e) => this.handleContractFormSubmit(e));
    
    // Botão de importação de leituras
    if (DOM.importInvoiceButton) {
      DOM.importInvoiceButton.addEventListener('click', () => {
        AuthService.requireAuthentication(() => {
          DOM.importInvoiceFileInput.click();
        });
      });
      
      // Atualizar texto do botão
      DOM.importInvoiceButton.textContent = 'Importar Leituras (TXT/CSV)';
      DOM.importInvoiceButton.title = 'Importar leituras de ficheiros TXT ou CSV';
    }
    
    // Atualizar input file
    if (DOM.importInvoiceFileInput) {
      DOM.importInvoiceFileInput.accept = '.txt,.csv,.TXT,.CSV';
      DOM.importInvoiceFileInput.title = 'Selecione um ficheiro TXT ou CSV';
    }
    
    // Adicionar botão de exportação de leituras
    this.addExportReadingsButton();
  }
  
  static openClientModal(client = null) {
    DOM.clientModalTitle.textContent = client ? 'Editar Cliente' : 'Adicionar Cliente';
    DOM.clientForm.reset();
    
    if (client) {
      DOM.clientIdInput.value = client.id;
      DOM.clientNameInput.value = client.name;
      DOM.clientContactInput.value = client.contact;
      DOM.clientConnectionDateInput.value = client.connectionDate;
    } else {
      DOM.clientIdInput.value = '';
    }
    
    DOM.clientModal.classList.remove('hidden');
  }
  
  static openContractModal(contract = null) {
    DOM.contractForm.reset();
    DOM.contractIdInput.value = '';
    DOM.contractModalTitle.textContent = 'Adicionar Contrato';
    DOM.contractValueInput.value = 5000;
    
    DOM.contractClientSelect.innerHTML = '<option value="">Selecione um cliente</option>';
    state.clients.forEach(client => {
      const hasContract = Object.values(state.contracts).some(c => c.clientId === client.id);
      const option = document.createElement('option');
      option.value = client.id;
      option.textContent = `${client.name} (ID: ${client.id})`;
      if (hasContract) {
        option.disabled = true;
        option.textContent += ' (Já tem contrato)';
      }
      DOM.contractClientSelect.appendChild(option);
    });
    
    DOM.contractModal.classList.remove('hidden');
  }
  
  static handleClientFormSubmit(e) {
    e.preventDefault();
    
    const clientData = {
      name: DOM.clientNameInput.value.trim(),
      contact: DOM.clientContactInput.value.trim(),
      connectionDate: DOM.clientConnectionDateInput.value,
      situacao: 'A',
      situationChangeDate: null
    };
    
    const errors = Utils.validateClientData(clientData);
    if (errors.length > 0) {
      alert('Erros de validação:\n' + errors.join('\n'));
      return;
    }
    
    const id = DOM.clientIdInput.value;
    
    AuthService.requestVerification(() => {
      if (id) {
        // Editar cliente existente
        const index = state.clients.findIndex(c => c.id == id);
        if (index > -1) {
          state.clients[index] = { ...state.clients[index], ...clientData };
        }
      } else {
        // Adicionar novo cliente
        const existingIds = state.clients.map(c => c.id);
        const newId = Utils.generateUniqueId(existingIds);
        state.clients.push({ id: newId, ...clientData });
        state.invoices[newId] = { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
        state.payments[newId] = { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
      }
      
      DataManager.save();
      UIManager.renderAllTables();
      DOM.clientModal.classList.add('hidden');
    });
  }
  
  static handleClientsTableClick(e) {
    const target = e.target;
    
    if (target.classList.contains('action-toggle')) {
      target.nextElementSibling.classList.toggle('visible');
      return;
    }
    
    const action = target.dataset.action;
    const id = target.dataset.id;
    
    if (!action || !id) return;
    
    if (action === 'edit') {
      const client = state.clients.find(c => c.id == id);
      if (client) {
        this.openClientModal(client);
      }
    } else if (action === 'delete') {
      if (confirm(`Tem a certeza que deseja remover o cliente #${id}? Esta ação não pode ser desfeita.`)) {
        AuthService.requestVerification(() => {
          state.clients = state.clients.filter(c => c.id != id);
          delete state.invoices[id];
          delete state.payments[id];
          
          // Remover contratos associados
          for (const contractId in state.contracts) {
            if (state.contracts[contractId].clientId == id) {
              delete state.contracts[contractId];
            }
          }
          
          DataManager.save();
          UIManager.renderAllTables();
        });
      }
    } else if (action === 'reset-meter') {
      if (confirm(`Tem a certeza que deseja simular a troca do contador para o cliente #${id}? A dívida atual será calculada e transferida, e as leituras serão zeradas.`)) {
        AuthService.requestVerification(() => {
          const invoice = state.invoices[id] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
          const payment = state.payments[id] || { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
          
          const { totalToPay } = Calculator.calculateInvoice(id, invoice, state.clients.find(c => c.id == id)?.situacao || 'A');
          const totalPaid = Calculator.calculatePayments(payment);
          const remainingAmount = totalToPay - totalPaid;
          
          state.invoices[id].debt = remainingAmount > 0 ? remainingAmount : 0;
          state.invoices[id].prevReading = 0;
          state.invoices[id].currentReading = 0;
          state.invoices[id].customAmount = null;
          
          state.payments[id] = { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
          
          DataManager.save();
          UIManager.renderAllTables();
          alert(`Contador para o cliente #${id} foi trocado com sucesso. Leituras zeradas e dívida atualizada.`);
        });
      }
    }
  }
  
  static handleSituacaoChange(e) {
    const select = e.target;
    if (!select.classList.contains('situacao-select')) return;
    
    const clientId = select.dataset.clientId;
    const newSituacao = select.value;
    const client = state.clients.find(c => c.id == clientId);
    
    if (!client) return;
    
    const originalSituacao = client.situacao || 'A';
    const invoice = state.invoices[clientId] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
    const payment = state.payments[clientId] || { p1: { amount: 0 }, p2: { amount: 0 }, p3: { amount: 0 } };
    
    AuthService.requestVerification(() => {
      client.situacao = newSituacao;
      
      // REGISTRAR DATA DA ALTERAÇÃO DE SITUAÇÃO (A ↔ F)
      if ((originalSituacao === 'A' && newSituacao === 'F') || (originalSituacao === 'F' && newSituacao === 'A')) {
        client.situationChangeDate = new Date().toISOString();
      } else {
        // Se não é alteração entre A e F, limpar a data
        client.situationChangeDate = null;
      }
      
      if (newSituacao === 'N') {
        const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, newSituacao);
        const totalPaid = Calculator.calculatePayments(payment);
        const valorEmFalta = totalToPay - totalPaid;
        
        invoice.customAmount = valorEmFalta + CONFIG.TARIFAS.CONSUMO_MINIMO;
        invoice.debt = 0;
      } else if (originalSituacao === 'N' && newSituacao !== 'N') {
        invoice.customAmount = null;
      } else if (newSituacao === 'F') {
        // ALTERAÇÃO: Quando muda de A para F, calcular o valor total e passar para dívida
        // MAS NÃO ZERAR AS LEITURAS
        const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, 'A');
        const totalPaid = Calculator.calculatePayments(payment);
        const valorEmFalta = totalToPay - totalPaid;
        
        // Passar o valor total para dívida, mas manter as leituras
        invoice.debt = valorEmFalta > 0 ? valorEmFalta : 0;
        invoice.customAmount = null;
        // NÃO ZERAR AS LEITURAS - manter para quando voltar para A
      } else if (originalSituacao === 'F' && newSituacao !== 'F') {
        // ALTERAÇÃO: Quando muda de F para A, manter a dívida E AS LEITURAS
        invoice.customAmount = null;
        // As leituras já estão mantidas, não fazemos nada
      }
      
      DataManager.save();
      UIManager.renderAllTables();
    }, () => {
      select.value = originalSituacao;
    });
  }
  
  static handleCellEdit(e) {
    const cell = e.target.closest('td[contenteditable="true"]');
    if (!cell) return;
    
    if (e.type === 'focus') {
      originalCellValue = cell.textContent.trim();
    } else if (e.type === 'blur') {
      const newCellValue = cell.textContent.trim();
      if (newCellValue !== originalCellValue) {
        AuthService.requestVerification(() => {
          this.updateStateFromCell(cell, newCellValue);
        }, () => {
          cell.textContent = originalCellValue;
        });
      }
    } else if (e.type === 'keydown' && e.key === 'Enter') {
      e.preventDefault();
      cell.blur();
    }
  }
  
  static updateStateFromCell(cell, value) {
    const clientId = cell.dataset.clientId;
    const field = cell.dataset.field;
    const client = state.clients.find(c => c.id == clientId);
    
    if (!client || !field) {
      UIManager.renderAllTables();
      return;
    }
    
    const parsedValue = Utils.parseNumber(value);
    
    if ((client.situacao === 'F' || client.situacao === 'N') && (field === 'prevReading' || field === 'currentReading')) {
      alert(`Não é possível alterar as leituras de um cliente com a situação "${client.situacao}".`);
      UIManager.renderInvoicesTable();
      return;
    }
    
    if (field === 'currentReading') {
      const currentInvoice = state.invoices[clientId];
      const prevReading = currentInvoice ? (currentInvoice.prevReading || 0) : 0;
      if (parsedValue < prevReading) {
        alert("A leitura atual não pode ser menor que a leitura anterior.");
        UIManager.renderInvoicesTable();
        return;
      }
    }
    
    if (['prevReading', 'currentReading', 'debt', 'customAmount'].includes(field)) {
      if (field === 'customAmount') {
        const invoice = state.invoices[clientId] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
        const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, client.situacao);
        state.invoices[clientId].customAmount = (Math.abs(parsedValue - totalToPay) > 0.01) ? parsedValue : null;
      } else {
        if (!state.invoices[clientId]) {
          state.invoices[clientId] = { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
        }
        state.invoices[clientId][field] = parsedValue;
        
        if (field === 'currentReading' || field === 'debt') {
          state.invoices[clientId].customAmount = null;
        }
      }
      
      DataManager.save();
      UIManager.renderInvoicesTable();
      UIManager.renderPaymentsTable();
    }
  }
  
  static handlePaymentsTableClick(e) {
    const target = e.target;
    
    // Verificar se é botão de gerar recibo para um pagamento específico
    if (target.classList.contains('btn-receipt')) {
      const cell = target.closest('.payment-cell');
      if (!cell) return;
      
      const clientId = cell.dataset.clientId;
      const field = target.dataset.field;
      const payment = state.payments[clientId] || { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
      
      // Verificar se há valor no pagamento
      if (!payment[field] || payment[field].amount === 0) {
        alert(`Não existe nenhum pagamento registado no ${field.replace('p', '')}º pagamento para gerar recibo.`);
        return;
      }
      
      ReceiptManager.generateReceipt(clientId, field);
      return;
    }
    
    // Código existente para editar pagamentos
    const cell = target.closest('.payment-cell');
    if (!cell) return;
    
    // Se clicou no valor do pagamento (para editar)
    if (target.classList.contains('payment-cell-value')) {
      const clientId = cell.dataset.clientId;
      const field = cell.dataset.field;
      const payment = state.payments[clientId] || { p1: { amount: 0, date: null }, p2: { amount: 0, date: null }, p3: { amount: 0, date: null } };
      const currentAmount = payment[field].amount || 0;
      
      AuthService.requestVerification(() => {
        const newAmountStr = prompt(`Insira o novo valor para o ${field.replace('p', '')}º pagamento:`, currentAmount);
        if (newAmountStr === null) return;
        
        const newAmount = Utils.parseNumber(newAmountStr);
        if (isNaN(newAmount)) {
          alert("Valor inválido. Por favor, insira um número.");
          return;
        }
        
        const invoice = state.invoices[clientId] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
        const client = state.clients.find(c => c.id == clientId);
        const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, client?.situacao || 'A');
        
        const paymentsExceptCurrent = Object.keys(payment)
          .filter(key => key !== field)
          .reduce((sum, key) => sum + (payment[key].amount || 0), 0);
        
        // Permitir qualquer valor (incluindo adiantamentos)
        payment[field].amount = newAmount;
        payment[field].date = (newAmount > 0) ? new Date().toISOString() : null;
        
        DataManager.save();
        UIManager.renderPaymentsTable();
        UIManager.renderInvoicesTable();
        
        // Informar sobre créditos se pagou mais do que deve
        if (paymentsExceptCurrent + newAmount > totalToPay) {
          const credito = (paymentsExceptCurrent + newAmount) - totalToPay;
          alert(`Pagamento registado com sucesso!\n\nO cliente pagou ${credito.toFixed(2)} MT a mais do que o valor total da fatura.\nEste valor ficará como crédito para futuras faturas.`);
        }
      });
    }
  }
  
  static handleContractsTableClick(e) {
    const target = e.target;
    const action = target.dataset.action;
    const contractId = target.dataset.id;
    
    if (action === 'delete-contract') {
      if (confirm(`Tem a certeza que deseja remover o contrato #${contractId}? Esta ação não pode ser desfeita.`)) {
        AuthService.requestVerification(() => {
          delete state.contracts[contractId];
          DataManager.save();
          UIManager.renderContractsTable();
        });
      }
    } else if (action === 'generate-contract-receipt') {
      ReceiptManager.generateContractReceipt(contractId);
    } else {
      // CORREÇÃO: Permitir edição direta dos valores de pagamento dos contratos
      const cell = target.closest('.payment-cell');
      if (!cell) return;
      
      const contractId = cell.dataset.contractId;
      const field = cell.dataset.field;
      const contract = state.contracts[contractId];
      if (!contract) return;
      
      // Se clicou no valor do pagamento (para editar)
      if (target.classList.contains('payment-cell-value')) {
        const currentAmount = contract.payments[field].amount || 0;
        
        AuthService.requestVerification(() => {
          const newAmountStr = prompt(`Insira o novo valor para o ${field.replace('p', '')}º pagamento do contrato:`, currentAmount);
          if (newAmountStr === null) return;
          
          const newAmount = Utils.parseNumber(newAmountStr);
          if (isNaN(newAmount)) {
            alert("Valor inválido. Por favor, insira um número.");
            return;
          }
          
          const paymentsExceptCurrent = Object.keys(contract.payments)
            .filter(key => key !== field)
            .reduce((sum, key) => sum + (contract.payments[key].amount || 0), 0);
          
          // CORREÇÃO: NÃO PERMITIR VALOR ACIMA DO CONTRATO
          if (paymentsExceptCurrent + newAmount > contract.value) {
            const valorAtual = paymentsExceptCurrent + currentAmount;
            const valorPermitido = contract.value - paymentsExceptCurrent;
            alert(`O valor total dos pagamentos não pode exceder o valor do contrato.\n\n` +
                  `Valor atual dos pagamentos: ${valorAtual.toFixed(2)} MT\n` +
                  `Valor do contrato: ${contract.value.toFixed(2)} MT\n` +
                  `Valor máximo permitido para este pagamento: ${valorPermitido.toFixed(2)} MT`);
            return;
          }
          
          contract.payments[field].amount = newAmount;
          contract.payments[field].date = (newAmount > 0) ? new Date().toISOString() : null;
          
          DataManager.save();
          UIManager.renderContractsTable();
        });
      }
    }
  }
  
  static handleContractFormSubmit(e) {
    e.preventDefault();
    
    const clientId = parseInt(DOM.contractClientSelect.value);
    const contractValue = Utils.parseNumber(DOM.contractValueInput.value);
    
    if (isNaN(clientId) || !clientId) {
      alert("Por favor, selecione um cliente.");
      return;
    }
    
    if (isNaN(contractValue) || contractValue <= 0) {
      alert("Por favor, insira um valor de contrato válido.");
      return;
    }
    
    const existingContract = Object.values(state.contracts).find(c => c.clientId === clientId);
    if (existingContract) {
      alert("Este cliente já possui um contrato.");
      return;
    }
    
    AuthService.requestVerification(() => {
      const existingContractIds = Object.keys(state.contracts).map(Number);
      const maxId = existingContractIds.length > 0 ? Math.max(...existingContractIds) : 1000;
      const newContractId = maxId + 1;
      
      state.contracts[newContractId] = {
        id: newContractId,
        clientId: clientId,
        value: contractValue,
        payments: {
          p1: { amount: 0, date: null },
          p2: { amount: 0, date: null },
          p3: { amount: 0, date: null }
        }
      };
      
      DataManager.save();
      UIManager.renderContractsTable();
      DOM.contractModal.classList.add('hidden');
    });
  }
  
  static handleNewMonth() {
    const clientsWithoutCurrentReading = state.clients.filter(client =>
      client.situacao === 'A' && (!state.invoices[client.id] || !state.invoices[client.id].currentReading)
    );
    
    if (clientsWithoutCurrentReading.length > 0) {
      const clientNames = clientsWithoutCurrentReading.map(c => c.name).join(', ');
      alert(`Não é possível iniciar um novo mês. Os seguintes clientes com situação 'A' não têm leitura atual: ${clientNames}.`);
      return;
    }
    
    if (confirm("Tem a certeza que deseja iniciar um novo mês? Esta ação irá arquivar os valores atuais e não pode ser desfeita.")) {
      AuthService.requestVerification(() => {
        state.clients.forEach(client => {
          const clientId = client.id;
          const invoice = state.invoices[clientId] || { prevReading: 0, currentReading: 0, debt: 0, customAmount: null };
          const payment = state.payments[clientId] || { p1: { amount: 0 }, p2: { amount: 0 }, p3: { amount: 0 } };
          
          // ALTERAÇÃO: Se o cliente está Fechado, NÃO fazer nada nas leituras
          if (client.situacao === 'F') {
            console.log(`Cliente ${clientId} está Fechado. Ignorando no novo mês.`);
            return;
          }
          
          const { totalToPay } = Calculator.calculateInvoice(clientId, invoice, client.situacao);
          const totalPaid = Calculator.calculatePayments(payment);
          const remainingAmount = totalToPay - totalPaid;
          
          // CORREÇÃO CRÍTICA: Para TODOS os clientes (exceto Fechados), 
          // a leitura atual deve passar para a leitura anterior
          // E a leitura atual deve ser zerada para o próximo mês
          
          // CORREÇÃO: Transferir a leitura atual para a leitura anterior
          state.invoices[clientId].prevReading = invoice.currentReading || 0;
          
          // CORREÇÃO: Zerar a leitura atual para o novo mês
          state.invoices[clientId].currentReading = 0;
          
          // CORREÇÃO: Manter créditos (valores negativos) na dívida
          // Se o cliente pagou a mais (remainingAmount < 0), manter esse crédito
          state.invoices[clientId].debt = remainingAmount; // Pode ser negativo (crédito)
          
          state.invoices[clientId].customAmount = null;
          
          // CORREÇÃO: Para clientes Não, ajustar a dívida corretamente
          if (client.situacao === 'N') {
            // Para clientes "Não", a dívida deve ser o valor em falta + consumo mínimo
            state.invoices[clientId].debt = (remainingAmount > 0 ? remainingAmount : 0) + CONFIG.TARIFAS.CONSUMO_MINIMO;
          }
          
          // CORREÇÃO: Zerar todos os pagamentos
          state.payments[clientId] = { 
            p1: { amount: 0, date: null }, 
            p2: { amount: 0, date: null }, 
            p3: { amount: 0, date: null } 
          };
        });
        
        DataManager.save();
        UIManager.renderAllTables();
        alert('Novo mês iniciado com sucesso! Leituras transferidas, dívidas atualizadas e pagamentos zerados.');
      });
    }
  }
  
  static handleEditReceiptOrder() {
    const currentOrderStr = state.receiptOrder.join(', ');
    const newOrderStr = prompt("Edite a sequência de IDs dos clientes, separados por vírgula:", currentOrderStr);
    
    if (newOrderStr === null) return;
    
    const newOrderArray = newOrderStr
      .split(',')
      .map(s => s.trim())
      .filter(s => s !== '')
      .map(s => parseInt(s, 10))
      .filter(num => !isNaN(num));
    
    AuthService.requestVerification(() => {
      state.receiptOrder = newOrderArray;
      DataManager.save();
      UIManager.renderReceipts();
      alert('Ordem da lista atualizada com sucesso!');
    });
  }
  
  static handleGenerateReceiptsByRange() {
    const startId = parseInt(DOM.clientStartIdInput.value);
    const endId = parseInt(DOM.clientEndIdInput.value);
    
    if (isNaN(startId) || isNaN(endId)) {
      alert('Por favor, insira um ID de cliente inicial e final válidos.');
      return;
    }
    
    if (startId <= 0 || endId <= 0) {
      alert('Os IDs dos clientes devem ser maiores que zero.');
      return;
    }
    
    if (startId > endId) {
      alert('O ID inicial não pode ser maior que o ID final.');
      return;
    }
    
    UIManager.renderReceipts(startId, endId);
  }
  
  static addExportReadingsButton() {
    // Verificar se o botão já existe
    if (document.getElementById('export-readings-button')) return;
    
    // Criar botão
    const exportButton = document.createElement('button');
    exportButton.id = 'export-readings-button';
    exportButton.textContent = 'Exportar Leituras (CSV)';
    exportButton.className = 'btn btn-secondary';
    exportButton.type = 'button';
    exportButton.style.marginLeft = '10px';
    
    // Adicionar evento
    exportButton.addEventListener('click', () => {
      DataManager.exportReadingsToCSV();
    });
    
    // Adicionar ao DOM
    if (DOM.importInvoiceButton && DOM.importInvoiceButton.parentNode) {
      DOM.importInvoiceButton.parentNode.insertBefore(exportButton, DOM.importInvoiceButton.nextSibling);
    }
    
    // Guardar referência
    DOM.exportReadingsButton = exportButton;
  }
}

// ================ INICIALIZAÇÃO ================
function init() {
  try {
    // Carregar dados
    DataManager.load();
    
    // Inicializar eventos
    EventManager.init();
    
    // Renderizar interface
    UIManager.renderAllTables();
    
    // Mostrar vista inicial
    DOM.views.forEach(v => v.classList.add('hidden'));
    document.getElementById('clients-view').classList.remove('hidden');
    
    console.log('Aplicação inicializada com sucesso');
  } catch (error) {
    console.error('Erro na inicialização:', error);
    alert('Erro ao inicializar a aplicação. Verifique o console para mais detalhes.');
  }
}

// Inicializar quando o DOM estiver carregado
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}