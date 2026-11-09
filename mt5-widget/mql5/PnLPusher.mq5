//+------------------------------------------------------------------+
//| PnLPusher.mq5                                                    |
//| Envoie régulièrement l'état du compte (P&L flottant, P&L du jour,|
//| positions ouvertes) vers Upstash Redis, pour qu'un widget iOS    |
//| (Scriptable) puisse l'afficher sur l'écran de verrouillage.      |
//|                                                                  |
//| Installation :                                                   |
//|  1. Fichier > Ouvrir le dossier des données > MQL5 > Experts     |
//|     -> copier ce fichier, puis le compiler dans MetaEditor (F7). |
//|  2. Outils > Options > Expert Advisors :                         |
//|     - cocher "Autoriser WebRequest pour les URL listées"         |
//|     - ajouter l'URL Upstash (ex: https://xxx.upstash.io)         |
//|  3. Glisser l'EA sur N'IMPORTE QUEL graphique, renseigner        |
//|     UpstashUrl + UpstashToken, et activer "Algo Trading".        |
//|                                                                  |
//| L'EA ne passe AUCUN ordre : il lit seulement le compte.          |
//+------------------------------------------------------------------+
#property copyright "hiikoz"
#property version   "1.00"

input string UpstashUrl     = "https://VOTRE-BASE.upstash.io"; // URL REST Upstash (sans / final)
input string UpstashToken   = "";                               // Token REST Upstash (lecture/écriture)
input string RedisKey       = "mt5pnl";                         // Clé Redis (une par compte si plusieurs)
input int    PushEverySec   = 15;                               // Fréquence d'envoi (secondes)
input int    KeepAliveSec   = 300;                              // Renvoi forcé même si rien n'a changé
input int    MaxPositions   = 20;                               // Nombre max de positions envoyées

string g_lastBody   = "";
datetime g_lastPush = 0;

//+------------------------------------------------------------------+
int OnInit()
  {
   if(StringLen(UpstashToken) == 0 || StringFind(UpstashUrl, "VOTRE-BASE") >= 0)
     {
      Print("PnLPusher: renseignez UpstashUrl et UpstashToken dans les paramètres de l'EA.");
      return(INIT_PARAMETERS_INCORRECT);
     }
   EventSetTimer(PushEverySec < 5 ? 5 : PushEverySec);
   Push(true);
   return(INIT_SUCCEEDED);
  }

void OnDeinit(const int reason) { EventKillTimer(); }
void OnTimer()                  { Push(false); }
void OnTick()                   { }

//+------------------------------------------------------------------+
string Num(double v, int digits = 2) { return DoubleToString(v, digits); }

string JsonStr(string s)
  {
   StringReplace(s, "\\", "\\\\");
   StringReplace(s, "\"", "\\\"");
   return "\"" + s + "\"";
  }

//--- P&L réalisé depuis minuit (heure serveur du broker), commissions et swaps inclus
double TodayClosedPnL()
  {
   datetime now = TimeCurrent();
   MqlDateTime dt;
   TimeToStruct(now, dt);
   dt.hour = 0; dt.min = 0; dt.sec = 0;
   datetime dayStart = StructToTime(dt);

   if(!HistorySelect(dayStart, now + 3600))
      return 0.0;

   double sum = 0.0;
   int total = HistoryDealsTotal();
   for(int i = 0; i < total; i++)
     {
      ulong deal = HistoryDealGetTicket(i);
      if(deal == 0) continue;
      long type = HistoryDealGetInteger(deal, DEAL_TYPE);
      if(type != DEAL_TYPE_BUY && type != DEAL_TYPE_SELL) continue; // ignore dépôts/retraits
      sum += HistoryDealGetDouble(deal, DEAL_PROFIT)
           + HistoryDealGetDouble(deal, DEAL_SWAP)
           + HistoryDealGetDouble(deal, DEAL_COMMISSION)
           + HistoryDealGetDouble(deal, DEAL_FEE);
     }
   return sum;
  }

//--- Construit le JSON (sans horodatage, pour pouvoir détecter les changements)
string BuildCore()
  {
   string pos = "";
   int n = 0;
   int total = PositionsTotal();
   for(int i = 0; i < total && n < MaxPositions; i++)
     {
      ulong ticket = PositionGetTicket(i);
      if(ticket == 0) continue;
      string sym  = PositionGetString(POSITION_SYMBOL);
      int digits  = (int)SymbolInfoInteger(sym, SYMBOL_DIGITS);
      string side = (PositionGetInteger(POSITION_TYPE) == POSITION_TYPE_BUY) ? "buy" : "sell";
      double pnl  = PositionGetDouble(POSITION_PROFIT) + PositionGetDouble(POSITION_SWAP);

      if(n > 0) pos += ",";
      pos += "{\"sym\":" + JsonStr(sym)
           + ",\"side\":\"" + side + "\""
           + ",\"vol\":"  + Num(PositionGetDouble(POSITION_VOLUME), 2)
           + ",\"open\":" + Num(PositionGetDouble(POSITION_PRICE_OPEN), digits)
           + ",\"cur\":"  + Num(PositionGetDouble(POSITION_PRICE_CURRENT), digits)
           + ",\"sl\":"   + Num(PositionGetDouble(POSITION_SL), digits)
           + ",\"tp\":"   + Num(PositionGetDouble(POSITION_TP), digits)
           + ",\"pnl\":"  + Num(pnl)
           + "}";
      n++;
     }

   return "\"login\":"     + IntegerToString(AccountInfoInteger(ACCOUNT_LOGIN))
        + ",\"currency\":" + JsonStr(AccountInfoString(ACCOUNT_CURRENCY))
        + ",\"balance\":"  + Num(AccountInfoDouble(ACCOUNT_BALANCE))
        + ",\"equity\":"   + Num(AccountInfoDouble(ACCOUNT_EQUITY))
        + ",\"floating\":" + Num(AccountInfoDouble(ACCOUNT_PROFIT))
        + ",\"today\":"    + Num(TodayClosedPnL())
        + ",\"margin\":"   + Num(AccountInfoDouble(ACCOUNT_MARGIN))
        + ",\"count\":"    + IntegerToString(total)
        + ",\"positions\":[" + pos + "]";
  }

//+------------------------------------------------------------------+
void Push(bool force)
  {
   string core = BuildCore();
   datetime now = TimeLocal();

   // Économise le quota Upstash : n'envoie que si quelque chose a changé
   if(!force && core == g_lastBody && (now - g_lastPush) < KeepAliveSec)
      return;

   string json = "{\"ts\":" + IntegerToString((long)TimeGMT()) + "," + core + "}";

   char data[];
   int len = StringToCharArray(json, data, 0, WHOLE_ARRAY, CP_UTF8);
   if(len > 0) ArrayResize(data, len - 1); // retire le \0 final

   string url     = UpstashUrl + "/set/" + RedisKey;
   string headers = "Authorization: Bearer " + UpstashToken + "\r\n"
                  + "Content-Type: text/plain\r\n";
   char   result[];
   string resultHeaders;

   ResetLastError();
   int code = WebRequest("POST", url, headers, 5000, data, result, resultHeaders);
   if(code == -1)
     {
      int err = GetLastError();
      if(err == 4014)
         Print("PnLPusher: URL non autorisée. Ajoutez ", UpstashUrl,
               " dans Outils > Options > Expert Advisors > WebRequest.");
      else
         Print("PnLPusher: WebRequest a échoué, erreur ", err);
      return;
     }
   if(code != 200)
     {
      Print("PnLPusher: HTTP ", code, " -> ", CharArrayToString(result, 0, WHOLE_ARRAY, CP_UTF8));
      return;
     }

   g_lastBody = core;
   g_lastPush = now;
  }
//+------------------------------------------------------------------+
