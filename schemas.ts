const User = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "User",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "用户唯一ID"
    },
    "username": {
      "type": "string",
      "minLength": 3,
      "maxLength": 50,
      "description": "用户名"
    },
    "password": {
      "type": "string",
      "minLength": 8,
      "description": "密码"
    },
    "role": {
      "type": "array",
      "items": {
        "type": "string",
        "enum": ["customer", "merchant", "admin"]
      },
      "description": "角色"
    },
    "phone": {
      "type": "string",
      "minLength": 6,
      "description": "phone"
    },
    "email": {
      "type": "string",
      "format": "email",
      "description": "邮箱"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time",
      "description": "创建时间"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time",
      "description": "更新时间"
    }
  },
  "required": ["username", "password", "role"],
  "additionalProperties": false
};


const Promotion = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "RoomType",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "房型唯一ID"
    },
    "hotelId": {
      "type": "string",
      "description": "所属酒店ID（引用 Hotel.id）"
    },
    "typeName": {
      "type": "string",
      "description": "房型名称（如标准间、豪华套房）"
    },
    "price": {
      "type": "number",
      "minimum": 0,
      "description": "基础价格（单位：元）"
    },
    "promotions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "关联的优惠ID数组（引用 Promotion.id，可选）"
    },
    "capacity": {
      "type": "integer",
      "minimum": 1,
      "description": "容纳人数（可选）"
    },
    "description": {
      "type": "string",
      "description": "房型描述（可选）"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": ["hotelId", "typeName", "price"],
  "additionalProperties": false
}

const Room = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Room",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "房型唯一ID"
    },
    "hotelId": {
      "type": "string",
      "description": "所属酒店ID"
    },
    "name": {
      "type": "string",
      "description": "房型名称"
    },
    "price": {
      "type": "number",
      "minimum": 0,
      "description": "基础价格（元）"
    },
    "promotions": {
      "type": "array",
      "items": Promotion,
      "description": "房型关联的优惠"
    },
    "stock": {
      "type": "integer",
      "minimum": 0,
      "description": "库存"
    },
    "capacity": {
      "type": "integer",
      "minimum": 1,
      "description": "容纳人数（可选）"
    },
    "description": {
      "type": "string",
      "description": "房型描述（可选）"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": ["hotelId", "name", "price", "stock"],
  "additionalProperties": false
};

const Hotel = {
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "Hotel",
  "type": "object",
  "properties": {
    "id": {
      "type": "string",
      "description": "酒店ID"
    },
    "name": {
      "type": "object",
      "properties": {
        "zh": { "type": "string", "description": "中文酒店名" },
        "en": { "type": "string", "description": "英文酒店名" }
      },
      "required": ["zh"],
      "description": "酒店名（中/英显示）"
    },
    "ownerId": {
      "type": "string",
      "description": "酒店所属商户ID"
    },
    "address": {
      "type": "string",
      "description": "酒店地址"
    },
    "starRating": {
      "type": "integer",
      "minimum": 1,
      "maximum": 5,
      "description": "酒店星级（1-5）"
    },
    "openingDate": {
      "type": "string",
      "format": "date",
      "description": "酒店开业时间"
    },
    "nearbyAttractions": {
      "type": "array",
      "items": { "type": "string" },
      "description": "附近热门景点、交通及商场"
    },
    "images": {
      "type": "array",
      "items": { "type": "string", "format": "uri" },
      "description": "酒店图片URL数组，用于 Banner 显示"
    },
    "facilities": {
      "type": "array",
      "items": { "type": "string" },
      "description": "酒店设施（如免费停车场、亲子等），用于快捷标签和筛选"
    },
    "status": {
      "type": "string",
      "enum": ["pending", "approved", "rejected", "offline"],
      "description": "酒店状态：pending（审核中）、approved（通过/发布）、rejected（不通过）、offline（下线）"
    },
    "statusDescription": {
      "type": "string",
      "description": "酒店状态详细说明"
    },
    "rooms": {
      "type": "array",
      "item": Room,
      "description": "房型列表"
    },
    "createdAt": {
      "type": "string",
      "format": "date-time"
    },
    "updatedAt": {
      "type": "string",
      "format": "date-time"
    }
  },
  "required": ["name", "address", "starRating", "openingDate", "status"],
  "additionalProperties": false
};

