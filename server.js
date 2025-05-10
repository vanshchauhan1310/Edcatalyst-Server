const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize Firebase Admin
const serviceAccount = require('./serviceAccountKey.json');
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
});

const db = admin.firestore();

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

// Contact Form Email API endpoint
app.post('/api/send-email', async (req, res) => {
    try {
        const { from, name, subject, message } = req.body;

        if (!from || !name || !subject || !message) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide all required fields'
            });
        }

        console.log('Attempting to send contact form email...');
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

        console.log('Contact form email sent successfully:', data);

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

// Registration confirmation email endpoint
// Registration confirmation email endpoint
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { name, email, course } = req.body;

        if (!name || !email || !course) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide name, email, and course'
            });
        }

        // Check if email was already sent
        const registrationsRef = db.collection('internship_registrations');
        const querySnapshot = await registrationsRef
            .where('email', '==', email)
            .where('confirmationEmailSent', '==', true)
            .get();

        if (!querySnapshot.empty) {
            return res.status(200).json({
                success: true,
                message: 'Confirmation email was already sent to this user',
                alreadySent: true
            });
        }

        // Check if the email is verified (only allow sending to your own email for now)
        // if (email !== 'vanshchauhan1310@gmail.com') {
        //     console.log('Skipping email to unverified address:', email);
        //     return res.status(200).json({
        //         success: true,
        //         message: 'Email skipped - domain not verified',
        //         skipped: true
        //     });
        // }

        console.log('Sending registration confirmation email...');
        console.log('To:', email);
        console.log('Name:', name);
        console.log('Course:', course);

        // Add delay to respect rate limiting (2 requests per second)
        await new Promise(resolve => setTimeout(resolve, 500));

        const data = await resend.emails.send({
            from: 'Resend <onboarding@resend.dev>',
            to: [email],
            subject: 'Confirmation of Registration – EdCatalyst Summer Internship Program',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <p>Dear ${name},</p>
                    
                    <p>Thank you for registering for the EdCatalyst Summer Internship Program. We are pleased to confirm that your registration for the ${course} internship has been successfully received. Please note that this registration does not guarantee final selection. The next step in the process is the Online Scholarship Examination, which will be conducted on [Exam Date, if available]. Your performance in this assessment will determine your eligibility for the internship as well as any applicable scholarship benefits.</p>
                    
                    <p>Following the examination, shortlisted candidates will receive an official selection email along with further instructions for completing the enrollment, including fee payment and document submission. We encourage you to prepare thoroughly for the exam, as it plays a crucial role in securing your place in the program.</p>
                    
                    <p>If you have any questions or require additional details regarding the exam pattern or syllabus, feel free to reach out to edcatalyst.in@gmail.com, our Internship Coordinator.</p>
                    
                    <p>We appreciate your interest in EdCatalyst and look forward to your participation in the upcoming examination.</p>
                    
                    <p>Warm regards,<br>
                    Team EdCatalyst<br>
                    www.edcatalyst.in</p>
                </div>
            `,
            reply_to: 'edcatalyst.in@gmail.com'
        });

        if (data.error) {
            throw new Error(data.error.message);
        }

        // Update the registration document to mark email as sent
        const registrationDoc = await registrationsRef
            .where('email', '==', email)
            .limit(1)
            .get();

        if (!registrationDoc.empty) {
            const docRef = registrationDoc.docs[0].ref;
            await docRef.update({
                confirmationEmailSent: true,
                emailSentAt: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        console.log('Confirmation email sent successfully:', data);

        return res.status(200).json({
            success: true,
            message: 'Confirmation email sent successfully',
            data
        });
    } catch (error) {
        console.error('Error sending confirmation email:', {
            message: error.message,
            code: error.code,
            cause: error.cause
        });
        
        // Don't mark as sent if there was an error
        return res.status(500).json({
            error: 'Failed to send confirmation email',
            message: 'There was an error sending the confirmation email. Please try again later.',
            details: error.message
        });
    }
}); 

// Health check endpoint
app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', resendConfigured: !!process.env.RESEND_API_KEY });
});

app.get('/', (req, res) => {
    res.send("EdCatalyst Server - Contact Form & Registration System");
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Resend API Key configured:', !!process.env.RESEND_API_KEY);
});