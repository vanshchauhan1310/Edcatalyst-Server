const express = require('express');
const cors = require('cors');
const { Resend } = require('resend');
const admin = require('firebase-admin');
require('dotenv').config();

const app = express();
const port = 3000;

// Initialize Firebase Admin
try {
    // Initialize with environment variables
    const app = admin.initializeApp({
        credential: admin.credential.cert({
            projectId: process.env.FIREBASE_PROJECT_ID,
            clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
            privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
        }),
        projectId: process.env.FIREBASE_PROJECT_ID,
        databaseURL: `https://${process.env.FIREBASE_PROJECT_ID}.firebaseio.com`
    });

    console.log('Firebase Admin SDK initialized successfully');
    
    // Verify the app is properly initialized
    const apps = admin.apps;
    console.log('Initialized Firebase apps:', apps.map(app => app.name));
    
} catch (error) {
    console.error('Error initializing Firebase Admin SDK:', {
        message: error.message,
        code: error.code,
        stack: error.stack
    });
    process.exit(1);
}

// Initialize Firestore with explicit settings
const db = admin.firestore();
db.settings({
    ignoreUndefinedProperties: true,
    projectId: process.env.FIREBASE_PROJECT_ID
});

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('.')); // Serve static files from current directory

// Initialize Resend with timeout configuration
const resend = new Resend(process.env.RESEND_API_KEY, {
    timeout: 10000, // 10 second timeout
    retries: 3,     // Number of retries
    retryDelay: 1000 // Initial retry delay in ms
});

// Verify Resend API key
if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not set in environment variables');
    process.exit(1);
}

// Helper function to send email with retries
async function sendEmailWithRetry(emailConfig, maxRetries = 3) {
    let lastError;
    
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            console.log(`Attempting to send email (Attempt ${attempt}/${maxRetries})...`);
            
            // Add exponential backoff delay between retries
            if (attempt > 1) {
                const delay = Math.min(1000 * Math.pow(2, attempt - 1), 10000); // Max 10 second delay
                console.log(`Waiting ${delay/1000} seconds before retry...`);
                await new Promise(resolve => setTimeout(resolve, delay));
            }

            const data = await resend.emails.send(emailConfig);
            
            if (data.error) {
                throw new Error(data.error.message);
            }

            console.log('Email sent successfully:', data);
            return data;

        } catch (error) {
            lastError = error;
            const isNetworkError = error.message.includes('fetch failed') || 
                                 error.message.includes('ETIMEDOUT') ||
                                 error.message.includes('ECONNREFUSED') ||
                                 error.message.includes('network') ||
                                 error.message.includes('timeout');

            console.error(`Attempt ${attempt} failed:`, {
                message: error.message,
                code: error.code,
                cause: error.cause,
                isNetworkError
            });

            // If it's not a network error or we're out of retries, throw the error
            if (!isNetworkError || attempt === maxRetries) {
                throw error;
            }
        }
    }

    throw lastError;
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
            to: ['edcatalyst.in@gmail.com'],
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
app.post('/api/send-confirmation', async (req, res) => {
    try {
        const { name, email, course } = req.body;

        // Map course codes to full names
        const courseNames = {
            'web': 'WebCraft Pro: Full Stack Bootcamp',
            'cyber': 'Certified Cybersecurity Foundations and Practical Analyst Program (CCFPAP)',
            'data': 'Data Science & Machine Learning',
            'cloud': 'Cloud Computing & DevOps'
        };

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
            .get();

        if (!querySnapshot.empty) {
            const registrationDoc = querySnapshot.docs[0];
            const registrationData = registrationDoc.data();

            // If email was already sent successfully, return early
            if (registrationData.confirmationEmailSent) {
                console.log('Email already sent to:', email);
                return res.status(200).json({
                    success: true,
                    message: 'Confirmation email was already sent to this user',
                    alreadySent: true
                });
            }

            // If there were previous failed attempts, check if we should retry
            if (registrationData.emailAttempts && registrationData.emailAttempts >= 3) {
                console.log('Maximum email attempts reached for:', email);
                return res.status(429).json({
                    error: 'Too many attempts',
                    message: 'Maximum number of email attempts reached. Please contact support.'
                });
            }
        }

        console.log('Sending registration confirmation email...');
        console.log('To:', email);
        console.log('Name:', name);
        console.log('Course:', courseNames[course] || course);

        const emailConfig = {
            from: 'EdCatalyst <noreply@edcatalyst.in>',
            to: [email],
            subject: 'Confirmation of Registration – EdCatalyst Summer Internship Program',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <p>Dear ${name},</p>
                    
                    <p>Thank you for registering for the EdCatalyst Summer Internship Program. We are pleased to confirm that your registration for the ${courseNames[course] || course} internship has been successfully received. Please note that this registration does not guarantee final selection. The next step in the process is the Online Scholarship Examination, which will be conducted on [Exam Date, if available]. Your performance in this assessment will determine your eligibility for the internship as well as any applicable scholarship benefits.</p>
                    
                    <p>Following the examination, shortlisted candidates will receive an official selection email along with further instructions for completing the enrollment, including fee payment and document submission. We encourage you to prepare thoroughly for the exam, as it plays a crucial role in securing your place in the program.</p>
                    
                    <p>If you have any questions or require additional details regarding the exam pattern or syllabus, feel free to reach out to edcatalyst.in@gmail.com, our Internship Coordinator.</p>
                    
                    <p>We appreciate your interest in EdCatalyst and look forward to your participation in the upcoming examination.</p>
                    
                    <p>Warm regards,<br>
                    Team EdCatalyst<br>
                    www.edcatalyst.in</p>
                </div>
            `,
            reply_to: 'edcatalyst.in@gmail.com'
        };

        try {
            // Send email with retry logic
            const data = await sendEmailWithRetry(emailConfig);

            // Update the registration document to mark email as sent
            const registrationDoc = querySnapshot.empty ? 
                await registrationsRef.add({
                    email,
                    name,
                    course: courseNames[course] || course,
                    confirmationEmailSent: true,
                    emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
                    emailAttempts: 1,
                    lastEmailAttempt: admin.firestore.FieldValue.serverTimestamp()
                }) :
                await querySnapshot.docs[0].ref.update({
                    confirmationEmailSent: true,
                    emailSentAt: admin.firestore.FieldValue.serverTimestamp(),
                    emailAttempts: admin.firestore.FieldValue.increment(1),
                    lastEmailAttempt: admin.firestore.FieldValue.serverTimestamp()
                });

            console.log('Registration document updated successfully');

            return res.status(200).json({
                success: true,
                message: 'Confirmation email sent successfully',
                data
            });

        } catch (error) {
            // Update the registration document with failed attempt
            if (!querySnapshot.empty) {
                await querySnapshot.docs[0].ref.update({
                    emailAttempts: admin.firestore.FieldValue.increment(1),
                    lastEmailAttempt: admin.firestore.FieldValue.serverTimestamp(),
                    lastEmailError: error.message
                });
            }

            throw error;
        }

    } catch (error) {
        console.error('Error sending confirmation email:', {
            message: error.message,
            code: error.code,
            cause: error.cause
        });
        
        return res.status(500).json({
            error: 'Failed to send confirmation email',
            message: 'There was an error sending the confirmation email. Please try again later.',
            details: error.message
        });
    }
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
    try {
        // Test Firestore connection
        const testDoc = await db.collection('test').doc('test').get();
        res.json({ 
            status: 'ok', 
            resendConfigured: !!process.env.RESEND_API_KEY,
            firestoreConnected: true
        });
    } catch (error) {
        console.error('Firestore test error:', error);
        res.json({ 
            status: 'error', 
            resendConfigured: !!process.env.RESEND_API_KEY,
            firestoreConnected: false,
            error: error.message
        });
    }
});

// Test Firestore connection endpoint
app.get('/api/test-firestore', async (req, res) => {
    try {
        console.log('Testing Firestore connection...');
        
        // Try to list collections first
        const collections = await db.listCollections();
        console.log('Available collections:', collections.map(c => c.id));
        
        // Try to create a test document
        const testRef = db.collection('test').doc('connection-test');
        await testRef.set({
            timestamp: admin.firestore.FieldValue.serverTimestamp(),
            test: true
        });
        
        // Try to read it back
        const doc = await testRef.get();
        
        res.json({
            status: 'success',
            message: 'Firestore operations successful',
            data: {
                collections: collections.map(c => c.id),
                testDocument: doc.exists ? doc.data() : null
            }
        });
    } catch (error) {
        console.error('Firestore test error:', {
            message: error.message,
            code: error.code,
            stack: error.stack
        });
        
        res.status(500).json({
            status: 'error',
            message: 'Firestore test failed',
            error: {
                message: error.message,
                code: error.code
            }
        });
    }
});

app.get('/', (req, res) => {
    res.send("EdCatalyst Server - Contact Form & Registration System");
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
    console.log('Resend API Key configured:', !!process.env.RESEND_API_KEY);
});