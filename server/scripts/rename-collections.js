require('dotenv').config();
const mongoose = require('mongoose');

async function renameCollections() {
    try {
        await mongoose.connect(process.env.DB_URL);
        console.log('Connected to MongoDB');

        const db = mongoose.connection.db;

        // Get list of all collections
        const collections = await db.listCollections().toArray();
        const collectionNames = collections.map(c => c.name);

        console.log('Current collections:', collectionNames);

        // Drop wrongly pluralized collections (they should be empty)
        const toDrop = ['positions_opens', 'trades_openeds', 'trades_closeds'];
        for (const name of toDrop) {
            if (collectionNames.includes(name)) {
                await db.dropCollection(name);
                console.log(`✓ Dropped: ${name}`);
            }
        }

        // Rename old collections to new names
        const renames = [
            { from: 'open_trades', to: 'trades_opened' },
            { from: 'open_positions', to: 'positions_open' },
            { from: 'closed_trades', to: 'trades_closed' }
        ];

        for (const { from, to } of renames) {
            if (collectionNames.includes(from)) {
                await db.collection(from).rename(to);
                console.log(`✓ Renamed: ${from} → ${to}`);
            } else {
                console.log(`⚠ Collection not found: ${from}`);
            }
        }

        console.log('\n✅ Collection refactoring complete!');

        // Show final collections
        const finalCollections = await db.listCollections().toArray();
        console.log('Final collections:', finalCollections.map(c => c.name));

        await mongoose.disconnect();
        process.exit(0);
    } catch (error) {
        console.error('Error:', error);
        process.exit(1);
    }
}

renameCollections();
