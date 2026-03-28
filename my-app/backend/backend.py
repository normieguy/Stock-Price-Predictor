import yfinance as yf
import pandas as pd
import time
import firebase_admin
from firebase_admin import credentials, firestore
import traceback

# --- FIREBASE SETUP ---
cred = credentials.Certificate(r"C:\Users\HP\Documents\SPP\my-app\backend\serviceAccountKey.json")
firebase_admin.initialize_app(cred)

db = firestore.client()

def get_current_symbol():
    doc_ref = db.collection("config").document("currentSymbol").get()
    if doc_ref.exists:
        return doc_ref.to_dict().get("symbol", "HAL.NS")
    return "HAL.NS"

# --- SETTINGS ---
SYMBOL = get_current_symbol()
INTERVAL = "5m"
PERIOD = "1d"





# --- RSI FUNCTION ---
def calculate_rsi(data, window=14):
    delta = data.diff()

    gain = delta.clip(lower=0)
    loss = -delta.clip(upper=0)

    avg_gain = gain.rolling(window).mean()
    avg_loss = loss.rolling(window).mean()

    rs = avg_gain / avg_loss
    rsi = 100 - (100 / (1 + rs))

    return rsi.fillna(0)

# --- BOLLINGER BANDS ---
def calculate_bollinger_bands(data, window=20):
    sma = data.rolling(window=window).mean()
    std = data.rolling(window=window).std()

    upper_band = sma + (2 * std)
    lower_band = sma - (2 * std)

    return upper_band, lower_band

# --- FETCH DATA ---
def fetch_data(symbol):
    df = yf.download(symbol, interval=INTERVAL, period=PERIOD)

    if df.empty:
        return df

    # Flatten multi-index columns
    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df.reset_index()

    # Indicators
    df['RSI'] = calculate_rsi(df['Close'])
    df['BB_upper'], df['BB_lower'] = calculate_bollinger_bands(df['Close'])

    df = df.dropna()

    return df

# --- FIBONACCI ---
def calculate_fib(df):
    high = df['High'].max()
    low = df['Low'].min()
    fib_618 = high - (high - low) * 0.618
    return float(fib_618)

# --- SIGNAL LOGIC ---
def generate_signal(df):
    latest = df.iloc[-1]

    # Convert to pure float
    rsi = float(latest['RSI'])
    price = float(latest['Close'])
    fib_618 = calculate_fib(df)

    bb_upper = float(latest['BB_upper'])
    bb_lower = float(latest['BB_lower'])

    signal = "SELL"
    confidence = 50
    reason = "Neutral market"

    # 🔥 STRONG BUY
    if (rsi < 35) and (price <= fib_618) and (price <= bb_lower):
        signal = "BUY"
        confidence = 90
        reason = "Oversold + Fibonacci support + Lower Bollinger Band"

    # 🔥 STRONG SELL
    elif (rsi > 65) and (price >= bb_upper):
        signal = "SELL"
        confidence = 85
        reason = "Overbought + Upper Bollinger Band"

    # 🔥 WEAK BUY
    elif rsi < 40:
        signal = "BUY"
        confidence = 65
        reason = "RSI indicates potential reversal"

    return signal, confidence, reason, rsi, fib_618, bb_upper, bb_lower

# --- FORMAT FOR FRONTEND ---
def format_candles(df):
    candles = []

    for _, row in df.iterrows():
        candles.append({
            "time": int(pd.to_datetime(row['Datetime']).timestamp()),
            "open": float(row['Open']),
            "high": float(row['High']),
            "low": float(row['Low']),
            "close": float(row['Close']),
        })

    return candles

# --- MAIN LOOP ---
import time
import traceback

def run():
    while True:
        try:
            # 🔥 1. ALWAYS GET LATEST SYMBOL FROM FIREBASE
            SYMBOL = get_current_symbol()
            print("Fetching:", SYMBOL)

            # 🔥 2. FETCH DATA
            df = fetch_data(SYMBOL)

            if df.empty:
                print("No data fetched")
                time.sleep(5)
                continue

            # 🔥 3. GENERATE SIGNALS
            signal, confidence, reason, rsi, fib_618, bb_upper, bb_lower = generate_signal(df)

            # 🔥 4. FORMAT CANDLES
            candles = format_candles(df)

            # 🔥 5. PREPARE DATA
            data = {
                "symbol": SYMBOL,  # optional but useful
                "signal": signal,
                "confidence": confidence,
                "reason": reason,
                "rsi": round(rsi, 2),
                "fib_618": round(fib_618, 2),
                "bb_upper": round(bb_upper, 2),
                "bb_lower": round(bb_lower, 2),
                "inDemandZone": bool(rsi < 35),
                "history": candles,
                "timestamp": time.time()  # helps debugging freshness
            }

            # 🔥 6. PUSH TO FIREBASE
            db.collection("signals").document(SYMBOL).set(data)

            print(f"✅ Updated {SYMBOL}: {signal} | RSI: {rsi:.2f}")

        except Exception:
            print("❌ Full error:")
            traceback.print_exc()

        # ⏱️ 7. REFRESH EVERY 5 SECONDS
        time.sleep(5)

if __name__ == "__main__":
    run()