import { DataTypes } from 'sequelize'
import sequelize = require('../sequelize')

const ServerApiKey = sequelize.define('ServerApiKey', {
  id: {
    type: DataTypes.INTEGER,
    primaryKey: true,
    autoIncrement: true
  },
  server_id: {
    type: DataTypes.INTEGER,
    allowNull: false
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
    defaultValue: 'Unnamed Key'
  },
  key_hash: {
    type: DataTypes.STRING,
    allowNull: false
  },
  key_prefix: {
    type: DataTypes.STRING,
    allowNull: false
  },
  scopes: {
    type: DataTypes.TEXT,
    allowNull: false,
    defaultValue: '["server.everything"]'
  },
  expires_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  last_used_at: {
    type: DataTypes.DATE,
    allowNull: true
  },
  is_revoked: {
    type: DataTypes.INTEGER,
    defaultValue: 0
  },
  created_by: {
    type: DataTypes.INTEGER,
    allowNull: true
  },
  created_at: {
    type: DataTypes.DATE,
    defaultValue: DataTypes.NOW
  }
}, {
  tableName: 'server_api_keys',
  timestamps: false
});

export = ServerApiKey as any;
