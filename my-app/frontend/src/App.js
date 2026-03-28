import React, { useEffect, useRef, useState } from 'react';
import {
  createChart,
  CrosshairMode,
  LineStyle,
  CandlestickSeries,
  LineSeries
} from 'lightweight-charts';
import { initializeApp } from "firebase/app";
import { getFirestore, doc, onSnapshot, setDoc } from "firebase/firestore";
import { TrendingUp, TrendingDown, AlertCircle, Search } from 'lucide-react';
import './StockPredictor.css';

// --- FIREBASE CONFIG ---
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "spp1-bc14f.firebaseapp.com",
  projectId: "spp1-bc14f",
};

const app = initializeApp(firebaseConfig);
const db = getFirestore(app);

const StockPredictor = () => {
  const chartContainerRef = useRef(null);
  const fibLineRef = useRef(null);
  const bbUpperSeriesRef = useRef(null);
  const bbLowerSeriesRef = useRef(null);

  const [symbol, setSymbol] = useState("HAL.NS");
  const [input, setInput] = useState("");
  const [prediction, setPrediction] = useState(null);
  const [loading, setLoading] = useState(true);

  // 🔍 SEARCH
  const handleSearch = async () => {
    if (!input) return;

    const newSymbol = input.toUpperCase();
    setSymbol(newSymbol);
    setLoading(true);

    await setDoc(doc(db, "config", "currentSymbol"), {
      symbol: newSymbol
    });
  };

  useEffect(() => {
    if (!chartContainerRef.current) return;

    const chart = createChart(chartContainerRef.current, {
      width: chartContainerRef.current.clientWidth,
      height: 400,
      layout: {
        background: { color: '#0f172a' },
        textColor: '#e2e8f0'
      },
      grid: {
        vertLines: { color: '#1e293b' },
        horzLines: { color: '#1e293b' }
      },
      crosshair: { mode: CrosshairMode.Normal },
    });

    // ✅ Candles
    const candleSeries = chart.addSeries(CandlestickSeries, {
      upColor: '#22c55e',
      downColor: '#ef4444',
      wickUpColor: '#22c55e',
      wickDownColor: '#ef4444',
    });

    // ✅ Bollinger Bands
    const bbUpperSeries = chart.addSeries(LineSeries, {
      color: '#ef4444',
      lineWidth: 1,
    });

    const bbLowerSeries = chart.addSeries(LineSeries, {
      color: '#22c55e',
      lineWidth: 1,
    });

    bbUpperSeriesRef.current = bbUpperSeries;
    bbLowerSeriesRef.current = bbLowerSeries;

    const unsub = onSnapshot(
      doc(db, "signals", symbol),
      (docSnap) => {
        if (!docSnap.exists()) return;

        const data = docSnap.data();
        setPrediction(data);
        setLoading(false);

        if (Array.isArray(data.history)) {
          // ✅ Candles
          candleSeries.setData(data.history);

          // ✅ Bollinger Bands (CURVED)
          bbUpperSeries.setData(
            data.history.map(c => ({
              time: c.time,
              value: c.bb_upper
            }))
          );

          bbLowerSeries.setData(
            data.history.map(c => ({
              time: c.time,
              value: c.bb_lower
            }))
          );

          chart.timeScale().fitContent();
        }

        // ✅ Fibonacci line
        if (fibLineRef.current) {
          candleSeries.removePriceLine(fibLineRef.current);
        }

        fibLineRef.current = candleSeries.createPriceLine({
          price: data.fib_618,
          color: '#facc15',
          lineWidth: 2,
          lineStyle: LineStyle.Dashed,
          title: 'Fib 0.618',
        });
      }
    );

    return () => {
      unsub();
      chart.remove();
    };
  }, [symbol]);

  const signal = prediction?.signal?.toUpperCase();

  return (
    <div className="app">
      <div className="container">

        {/* HEADER */}
        <header className="header">
          <h1>AI Stock Predictor</h1>

          {/* SEARCH */}
          <div className="search-box">
            <input
              type="text"
              placeholder="Enter Stock (e.g. RELIANCE.NS)"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
            <button onClick={handleSearch}>
              <Search size={18} />
            </button>
          </div>
        </header>

        <div className="grid">

          {/* CHART */}
          <div className="card chart">
            <div ref={chartContainerRef} />
          </div>

          {/* SIDEBAR */}
          <div className="card sidebar">
            <h2>AI Signal</h2>

            {loading ? (
              <p className="loading">Loading...</p>
            ) : prediction ? (
              <>
                <div className={`signal ${signal === 'BUY' ? 'buy' : 'sell'}`}>
                  {signal === 'BUY' ? <TrendingUp /> : <TrendingDown />}
                  <span>{signal}</span>
                  <span className="confidence">{prediction.confidence}%</span>
                </div>

                <div className="stats">
                  <p>RSI: {prediction.rsi}</p>
                  <p>Demand Zone: {prediction.inDemandZone ? "YES" : "NO"}</p>
                  <p>Fib: {prediction.fib_618}</p>
                  <p>BB Upper: {prediction.bb_upper}</p>
                  <p>BB Lower: {prediction.bb_lower}</p>
                </div>

                <div className="reason">
                  <AlertCircle size={16} />
                  {prediction.reason}
                </div>
              </>
            ) : (
              <p>No Data</p>
            )}
          </div>

        </div>
      </div>
    </div>
  );
};

export default StockPredictor;