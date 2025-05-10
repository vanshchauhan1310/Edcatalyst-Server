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
        const { name, email, course } = req.body;

        if (!name || !email || !course) {
            return res.status(400).json({
                error: 'Missing required fields',
                message: 'Please provide name, email, and course'
            });
        }

        // Send confirmation email using Resend
        const data = await resend.emails.send({
            from: 'EdCatalyst <contact@edcatalyst.in>',
            to: [email],
            subject: 'Confirmation of Registration – EdCatalyst Summer Internship Program',
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
                    <p>Dear ${name},</p>
                    <p>Thank you for registering for the EdCatalyst Summer Internship Program. We are pleased to confirm that your registration for the <b>${course}</b> internship has been successfully received. Please note that this registration does not guarantee final selection. The next step in the process is the Online Scholarship Examination, which will be conducted on [Exam Date, if available]. Your performance in this assessment will determine your eligibility for the internship as well as any applicable scholarship benefits.</p>
                    <p>Following the examination, shortlisted candidates will receive an official selection email along with further instructions for completing the enrollment, including fee payment and document submission. We encourage you to prepare thoroughly for the exam, as it plays a crucial role in securing your place in the program.</p>
                    <p>If you have any questions or require additional details regarding the exam pattern or syllabus, feel free to reach out to edcatalyst.in@gmail.com, our Internship Coordinator.</p>
                    <p>We appreciate your interest in EdCatalyst and look forward to your participation in the upcoming examination.</p>
                    <p>Warm regards,<br>
                    Team EdCatalyst<br>
                    www.edcatalyst.in</p>
                </div>
            `,
        });

        return res.status(200).json({ 
            success: true,
            message: 'Confirmation email sent successfully',
            data 
        });
    } catch (error) {
        console.error('Error sending confirmation email:', error);
        return res.status(500).json({ 
            error: 'Failed to send confirmation email',
            message: error.message 
        });
    }
}