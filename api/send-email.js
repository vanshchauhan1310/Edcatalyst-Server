import { Resend } from 'resend';

// Initialize Resend with your API key
const resend = new Resend(process.env.RESEND_API_KEY);

export default async function handler(req, res) {
    // Enable CORS
    res.setHeader('Access-Control-Allow-CORS', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    // Handle preflight request
    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ 
            error: 'Method not allowed',
            message: 'Only POST requests are allowed'
        });
    }

    try {
        const { from, name, subject, message } = req.body;

        if (!from || !name || !subject || !message) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide all required fields'
            });
        }

        // Send email using Resend
        const data = await resend.emails.send({
            from: 'EdCatalyst Contact Form <contact@edcatalyst.in>',
            to: ['Keshav.sinha@yandex.com'],
            subject: `New Contact Form Submission: ${subject}`,
            html: `
                <h2>New Contact Form Submission</h2>
                <p><strong>Name:</strong> ${name}</p>
                <p><strong>Email:</strong> ${from}</p>
                <p><strong>Subject:</strong> ${subject}</p>
                <p><strong>Message:</strong></p>
                <p>${message}</p>
            `,
        });

        return res.status(200).json({ 
            success: true,
            message: 'Email sent successfully',
            data 
        });
    } catch (error) {
        console.error('Error sending email:', error);
        return res.status(500).json({ 
            error: 'Failed to send email',
            message: error.message 
        });
    }
} 