/**
 * File Storage utility for $INFERNO token
 * Replaces database operations with JSON file storage
 */
const fs = require('fs');
const path = require('path');
const logger = require('./logger');

// Base directory for data storage
const DATA_DIR = path.join(__dirname, '../../../data');

// Ensure data directory exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

// File paths for different data types
const FILES = {
  burns: path.join(DATA_DIR, 'burns.json'),
  metrics: path.join(DATA_DIR, 'metrics.json'),
  milestones: path.join(DATA_DIR, 'milestones.json'),
  rewards: path.join(DATA_DIR, 'rewards.json')
};

/**
 * Initialize storage files if they don't exist
 */
const initializeStorage = () => {
  // Create empty files with default structure if they don't exist
  if (!fs.existsSync(FILES.burns)) {
    fs.writeFileSync(FILES.burns, JSON.stringify([], null, 2));
  }
  
  if (!fs.existsSync(FILES.metrics)) {
    fs.writeFileSync(FILES.metrics, JSON.stringify([], null, 2));
  }
  
  if (!fs.existsSync(FILES.rewards)) {
    fs.writeFileSync(FILES.rewards, JSON.stringify([], null, 2));
  }
  
  logger.info('File storage initialized');
};

/**
 * Read data from a JSON file
 * @param {String} filePath - Path to the JSON file
 * @returns {Array|Object} Data from the file
 */
const readData = (filePath) => {
  try {
    if (!fs.existsSync(filePath)) {
      return [];
    }
    
    const data = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    logger.error(`Error reading data from ${filePath}: ${error.message}`);
    return [];
  }
};

/**
 * Write data to a JSON file
 * @param {String} filePath - Path to the JSON file
 * @param {Array|Object} data - Data to write
 */
const writeData = (filePath, data) => {
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
    return true;
  } catch (error) {
    logger.error(`Error writing data to ${filePath}: ${error.message}`);
    return false;
  }
};

/**
 * Save a new record to a collection
 * @param {String} collection - Collection name (burns, metrics, milestones, rewards)
 * @param {Object} record - Record to save
 * @returns {Object} Saved record with ID
 */
const saveRecord = (collection, record) => {
  try {
    if (!FILES[collection]) {
      throw new Error(`Invalid collection: ${collection}`);
    }
    
    const data = readData(FILES[collection]);
    
    // Add ID and timestamp if not provided
    const newRecord = {
      id: `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`,
      timestamp: record.timestamp || new Date().toISOString(),
      ...record
    };
    
    data.push(newRecord);
    writeData(FILES[collection], data);
    
    return newRecord;
  } catch (error) {
    logger.error(`Error saving record to ${collection}: ${error.message}`);
    throw error;
  }
};

/**
 * Find records in a collection
 * @param {String} collection - Collection name
 * @param {Function} filterFn - Filter function
 * @param {Object} options - Options for sorting, pagination, etc.
 * @returns {Array} Matching records
 */
const findRecords = (collection, filterFn = () => true, options = {}) => {
  try {
    if (!FILES[collection]) {
      throw new Error(`Invalid collection: ${collection}`);
    }
    
    let data = readData(FILES[collection]);
    
    // Apply filter
    data = data.filter(filterFn);
    
    // Apply sorting
    if (options.sort) {
      const { field, order } = options.sort;
      data.sort((a, b) => {
        if (order === 'desc') {
          return b[field] > a[field] ? 1 : -1;
        }
        return a[field] > b[field] ? 1 : -1;
      });
    }
    
    // Apply pagination
    if (options.limit) {
      const skip = options.skip || 0;
      data = data.slice(skip, skip + options.limit);
    }
    
    return data;
  } catch (error) {
    logger.error(`Error finding records in ${collection}: ${error.message}`);
    return [];
  }
};

/**
 * Find a single record in a collection
 * @param {String} collection - Collection name
 * @param {Function} filterFn - Filter function
 * @returns {Object|null} Matching record or null
 */
const findOneRecord = (collection, filterFn = () => true) => {
  try {
    const records = findRecords(collection, filterFn, { limit: 1 });
    return records.length > 0 ? records[0] : null;
  } catch (error) {
    logger.error(`Error finding record in ${collection}: ${error.message}`);
    return null;
  }
};

/**
 * Update a record in a collection
 * @param {String} collection - Collection name
 * @param {String} id - Record ID
 * @param {Object} updates - Fields to update
 * @returns {Object|null} Updated record or null
 */
const updateRecord = (collection, id, updates) => {
  try {
    if (!FILES[collection]) {
      throw new Error(`Invalid collection: ${collection}`);
    }
    
    const data = readData(FILES[collection]);
    const index = data.findIndex(record => record.id === id);
    
    if (index === -1) {
      return null;
    }
    
    // Update the record
    data[index] = {
      ...data[index],
      ...updates,
      updatedAt: new Date().toISOString()
    };
    
    writeData(FILES[collection], data);
    
    return data[index];
  } catch (error) {
    logger.error(`Error updating record in ${collection}: ${error.message}`);
    return null;
  }
};

/**
 * Count records in a collection
 * @param {String} collection - Collection name
 * @param {Function} filterFn - Filter function
 * @returns {Number} Count of matching records
 */
const countRecords = (collection, filterFn = () => true) => {
  try {
    if (!FILES[collection]) {
      throw new Error(`Invalid collection: ${collection}`);
    }
    
    const data = readData(FILES[collection]);
    return data.filter(filterFn).length;
  } catch (error) {
    logger.error(`Error counting records in ${collection}: ${error.message}`);
    return 0;
  }
};

module.exports = {
  FILES,
  initializeStorage,
  readData,
  writeData,
  saveRecord,
  findRecords,
  findOneRecord,
  updateRecord,
  countRecords
};