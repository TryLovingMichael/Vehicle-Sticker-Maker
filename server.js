const express = require('express');
const bodyParser = require('body-parser');
const fetch = (...args) => import('node-fetch').then(({default: fetch}) => fetch(...args));
const QRCode = require('qrcode');
const { createCanvas, loadImage } = require('canvas');
const fs = require('fs');
const path = require('path');
const PDFDocument = require('pdfkit');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.static('public'));
app.use(bodyParser.urlencoded({ extended: true }));
app.use(bodyParser.json());

app.post('/generate-sticker', async (req, res) => {
    const { vin, price, carfaxUrl } = req.body;

    try {
        const response = await fetch(`https://auto.dev/api/vin/${vin}?apikey=ZrQEPSkKbWljaGFlbGhheWRlbjIwMDNAZ21haWwuY29t`);
        const data = await response.json();
        
        if (!data || !data.make || !data.model || !data.engine || !data.transmission) {
            return res.status(400).json({ error: 'No vehicle data found for this VIN.' });
        }

        const vehicle = {
            year: data.years?.[0]?.year || 'N/A',
            make: data.make?.name || 'N/A',
            model: data.model?.name || 'N/A',
            trim: getVehicleTrim(data.years?.[0]?.styles) || 'N/A',
            engine: data.engine?.name || 'N/A',
            transmission: data.transmission?.name || 'N/A',
            drivetrain: formatDrivetrain(data.drivenWheels) || 'N/A',
            fuel: formatFuelType(data.engine?.fuelType) || 'N/A',
            exterior_color: getVehicleColor(data.colors, 'Exterior') || 'N/A',
            interior_color: getVehicleColor(data.colors, 'Interior') || 'N/A',
            features: getVehicleFeatures(data.options) || 'N/A',
            mpgCity: data.mpg?.city || 'N/A',
            mpgHighway: data.mpg?.highway || 'N/A',
            doors: data.numOfDoors || 'N/A',
            bodyType: formatBodyType(data.categories) || 'N/A',
            vin: vin,
            price: price ? `$${Number(price).toLocaleString()}` : 'N/A',
            engineDetails: data.engine || {},
            transmissionDetails: data.transmission || {},
            categories: data.categories || {},
            options: data.options || [],
            colors: data.colors || []
        };

        const qrImageDataUrl = await QRCode.toDataURL(carfaxUrl);
        const doc = new PDFDocument({ size: 'A4', margins: { top: 40, bottom: 40, left: 40, right: 40 } });
        const filePath = path.join(__dirname, 'public', `sticker-${vin}.pdf`);
        const writeStream = fs.createWriteStream(filePath);
        doc.pipe(writeStream);

        doc.rect(0, 0, doc.page.width, doc.page.height).fill('#f5f5f5');
        doc.fill('#333333');
        const logoPath = path.join(__dirname, 'public', 'your-company-logo.png');
        if (fs.existsSync(logoPath)) {
            doc.image(logoPath, 40, 30, { width: 70 });
        }

        doc.font('Helvetica-Bold').fontSize(20).fill('#2c3e50');
        doc.text(`${vehicle.year} ${vehicle.make} ${vehicle.model}`, 120, 35);
        doc.font('Helvetica-Bold').fontSize(18).fill('#e74c3c');
        doc.text(vehicle.price, 450, 35, { align: 'right' });
        doc.font('Helvetica').fontSize(12).fill('#7f8c8d');
        doc.text(`${vehicle.trim} Trim`, 120, 60);
        doc.moveTo(40, 85).lineTo(555, 85).stroke('#3498db').lineWidth(1);

        const column1X = 40;
        const column2X = 300;
        let currentY = 100;

        doc.font('Helvetica-Bold').fontSize(14).fill('#2c3e50');
        doc.text('Vehicle Overview', column1X, currentY);
        currentY += 20;

        doc.font('Helvetica').fontSize(10);
        addLabelValuePair(doc, 'Body Type:', vehicle.bodyType, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Exterior Color:', vehicle.exterior_color, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Interior Color:', vehicle.interior_color, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Number of Doors:', vehicle.doors, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Drivetrain:', vehicle.drivetrain, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Fuel Type:', vehicle.fuel, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'MPG (City/Highway):', `${vehicle.mpgCity} / ${vehicle.mpgHighway}`, column1X, currentY, 90);
        currentY += 25;

        doc.font('Helvetica-Bold').fontSize(14).fill('#2c3e50');
        doc.text('Engine Specifications', column1X, currentY);
        currentY += 20;

        doc.font('Helvetica').fontSize(10);
        addLabelValuePair(doc, 'Displacement:', `${vehicle.engineDetails.size}L`, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Cylinders:', vehicle.engineDetails.cylinder, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Horsepower:', `${vehicle.engineDetails.horsepower} hp @ ${vehicle.engineDetails.rpm?.horsepower || 'N/A'} RPM`, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Torque:', `${vehicle.engineDetails.torque} lb-ft @ ${vehicle.engineDetails.rpm?.torque || 'N/A'} RPM`, column1X, currentY, 90);
        currentY += 15;
        addLabelValuePair(doc, 'Valve Timing:', vehicle.engineDetails.valve?.timing || 'N/A', column1X, currentY, 90);
        currentY += 25;

        let column2Y = 100;
        doc.font('Helvetica-Bold').fontSize(14).fill('#2c3e50');
        doc.text('Transmission', column2X, column2Y);
        column2Y += 20;

        doc.font('Helvetica').fontSize(10);
        addLabelValuePair(doc, 'Type:', vehicle.transmission, column2X, column2Y, 90);
        column2Y += 15;
        addLabelValuePair(doc, 'Automatic Type:', vehicle.transmissionDetails.automaticType || 'N/A', column2X, column2Y, 90);
        column2Y += 15;
        addLabelValuePair(doc, 'Speeds:', vehicle.transmissionDetails.numberOfSpeeds || 'N/A', column2X, column2Y, 90);
        column2Y += 25;

        doc.font('Helvetica-Bold').fontSize(14).fill('#2c3e50');
        doc.text('Features & Options', column2X, column2Y);
        column2Y += 20;

        doc.font('Courier').fontSize(8);
        const remainingSpace = 750 - column2Y;
        doc.text(vehicle.features, column2X, column2Y, {
            width: 250,
            height: remainingSpace,
            ellipsis: '...',
            lineGap: 3
        });

        doc.font('Helvetica-Bold').fontSize(10).fill('#2c3e50');
        doc.text('Vehicle Identification', 40, 700);
        doc.font('Helvetica').fontSize(9);
        doc.text(`VIN: ${vehicle.vin}`, 40, 715);
        doc.text(`EPA Class: ${vehicle.categories.epaClass || 'N/A'}`, 40, 730);

        const qrBuffer = Buffer.from(qrImageDataUrl.split(',')[1], 'base64');
        const qrPath = path.join(__dirname, 'temp_qr.png');
        fs.writeFileSync(qrPath, qrBuffer);
        doc.image(qrPath, 450, 700, { width: 80 });
        doc.fontSize(8).text('Scan for details', 450, 775, { width: 80, align: 'center' });

        doc.fontSize(8).fill('#7f8c8d')
           .text('*Prices are subject to change and are without taxes or fees', 40, 790, { align: 'left' });

        doc.fontSize(8).fill('#7f8c8d')
           .text('Revolution RV and Auto', 40, 765, { align: 'left' });

        doc.end();

        writeStream.on('finish', () => {
            fs.unlinkSync(qrPath);
            res.json({ success: true, url: `/sticker-${vin}.pdf` });
        });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Failed to generate sticker' });
    }
});

function addLabelValuePair(doc, label, value, x, y, labelWidth = 100) {
    doc.font('Helvetica-Bold').text(label, x, y, { width: labelWidth });
    doc.font('Helvetica').text(value || 'N/A', x + labelWidth, y);
}

function formatDrivetrain(drivetrain) {
    if (!drivetrain) return 'N/A';
    return drivetrain.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatFuelType(fuelType) {
    if (!fuelType) return 'N/A';
    return fuelType.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
}

function formatBodyType(categories) {
    if (!categories) return 'N/A';
    return categories.vehicleStyle || categories.primaryBodyType || categories.epaClass || 'N/A';
}

function getVehicleTrim(styles) {
    if (styles && styles.length > 0) {
        return styles[0]?.trim || 'N/A';
    }
    return 'N/A';
}

function getVehicleColor(colors, category) {
    if (colors && colors.length > 0) {
        const categoryColors = colors.find(color => color.category === category);
        if (categoryColors && categoryColors.options && categoryColors.options.length > 0) {
            return categoryColors.options[0]?.name || 'N/A';
        }
    }
    return 'N/A';
}

function getVehicleFeatures(options) {
    if (!options || !Array.isArray(options)) return 'N/A';
    const features = [];
    options.forEach(optionCategory => {
        if (optionCategory.options && optionCategory.options.length > 0) {
            features.push(`${optionCategory.category.toUpperCase()}:`);
            optionCategory.options.forEach(option => {
                let featureString = `• ${option.name}`;
                if (option.availability && option.availability !== 'All') {
                    featureString += ` (Available on: ${option.availability})`;
                }
                if (option.description) {
                    featureString += ` - ${option.description}`;
                }
                features.push(featureString);
            });
            features.push('');
        }
    });
    return features.length > 0 ? features.join('\n') : 'N/A';
}

function simplifyEngine(engineName) {
    if (!engineName) return 'N/A';
    const engineParts = engineName.split(' ');
    return engineParts.slice(0, 2).join(' ');
}

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});