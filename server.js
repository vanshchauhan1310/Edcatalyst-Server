const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
require('dotenv').config();

const app = express();
const port = 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Initialize Resend
const resend = new Resend(process.env.RESEND_API_KEY);

// Verify Resend API key
if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables');
    process.exit(1);
}

// Email API endpoint
app.post('/api/send-email', async (req, res) => {
    try {
        const { from, name, subject, message } = req.body;

        if (!from || !name || !subject || !message) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide all required fields'
            });
        }

        console.log('Attempting to send email...');
        console.log('From:', from);
        console.log('Name:', name);
        console.log('Subject:', subject);

        const data = await resend.emails.send({
            from: 'Resend <onboarding@resend.dev>',  // Using Resend's default domain
            to: ['vanshchauhan1310@gmail.com'],
            subject: `New Contact Form Submission: ${subject}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${from}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `,
            reply_to: from  // Add reply-to header
        });

        if (data.error) {
            throw new Error(data.error.message);
        }

        console.log('Email sent successfully:', data);

        return res.status(200).json({
            success: true,
            message: 'Email sent successfully',
            data
        });
    } catch (error) {
        console.error('Detailed error:', {
            message: error.message,
            code: error.code,
            cause: error.cause
        });
        
        return res.status(500).json({
            error: 'Failed to send email',
            message: 'There was an error sending your message. Please try again later.',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', resendConfigured: !!process.env.RESEND_API_KEY });
});

app.get('/', (req, res) => {
res.send("Hello World");
});


app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Resend API Key configured:', !!process.env.RESEND_API_KEY);
}); 