const express = require('express');
const path = require('path');
const { GoogleGenAI } = require('@google/genai');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(express.json());

// Serve static files from "public"
app.use(express.static(path.join(__dirname, 'public')));

// Supabase Setup
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://ssoqywucchnzpeweubla.supabase.co';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';
const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

// Gemini AI Setup
const aiKey = process.env.GEMINI_API_KEY || '';
const ai = new GoogleGenAI({ apiKey: aiKey });

// --- Real AI Agent Execution Endpoint ---
app.post('/api/agent/execute', async (req, res) => {
  try {
    const { command, type } = req.body;
    if (!command) return res.status(400).json({ error: 'Command required.' });

    let systemInstruction = 'You are Synapse Shadow OS, an elite executive AI life operating system. Provide concise, high-impact, actionable, and structured syntheses for modern leaders.';
    
    if (type === 'briefing') {
      systemInstruction = 'Synthesize a morning executive briefing focusing on optimal time management, critical focus objectives, and high-leverage decisions.';
    } else if (type === 'calendar') {
      systemInstruction = 'Analyze schedule conflicts and propose an optimized agenda with zero meeting overlaps.';
    } else if (type === 'expense') {
      systemInstruction = 'Audit recurring business and personal expenses, identifying idle or redundant SaaS seats.';
    }

    const response = await ai.models.generateContent({
      model: 'gemini-2.5-flash',
      contents: command,
      config: {
        systemInstruction: systemInstruction,
        temperature: 0.7,
      }
    });

    res.status(200).json({
      success: true,
      output: response.text,
      timestamp: new Date().toISOString()
    });

  } catch (err) {
    console.error('Gemini Execution Error:', err.message);
    res.status(500).json({ error: 'Failed to process AI agent execution.' });
  }
});

// --- Paddle Webhook Listener ---
app.post('/api/webhooks/paddle', async (req, res) => {
  try {
    const event = req.body;
    const eventType = event.event_type;
    const data = event.data;

    if (eventType === 'subscription.created' || eventType === 'subscription.updated') {
      await supabaseAdmin.from('subscriptions').upsert({
        user_id: data.custom_data?.user_id || data.customer_id,
        paddle_customer_id: data.customer_id,
        paddle_subscription_id: data.id,
        price_id: data.items?.[0]?.price?.id,
        status: data.status,
        current_period_end: data.current_billing_period?.ends_at || new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }

    if (eventType === 'transaction.completed') {
      await supabaseAdmin.from('transactions').insert({
        transaction_id: data.id,
        user_id: data.customer_id,
        amount: data.details?.totals?.total ? Number(data.details.totals.total) / 100 : 0,
        currency: data.currency_code || 'USD',
        status: data.status,
      });
    }

    res.status(200).json({ received: true });
  } catch (err) {
    console.error('Webhook Error:', err.message);
    res.status(400).json({ error: 'Webhook processing failed' });
  }
});

// For local testing
if (process.env.NODE_ENV !== 'production') {
  const PORT = process.env.PORT || 3000;
  app.listen(PORT, () => {
    console.log(`Synapse Shadow OS live locally on port ${PORT}`);
  });
}

// Export for Vercel Serverless
module.exports = app;
