### 1. 用户相关 API (User)

POST /api/users/register 
Desc: 用户注册，选择角色 
Request: body = User Schema (无id、createdAt、updatedAt；password明文，后端加密) 
Response: data = { "id": string, "username": string, "role": string } (201 Created) 
Permission: 无

POST /api/users/login 
Desc: 用户登录，自动判断角色 
Request: body = { "username": string, "password": string } 
Response: data = { "token": string, "user": { "id": string, "username": string, "role": string } } (200 OK) 
Permission: 无

GET /api/users/me 
Desc: 获取当前用户信息 
Request: body = 无 
Response: data = User Schema (无password) (200 OK) 
Permission: customer, merchant, admin

### 2. 酒店相关 API (Hotel)

POST /api/hotels 
Desc: 商户/管理员创建酒店（初始status=pending） 
Request: body = Hotel Schema (无id、createdAt、updatedAt、status；商户ownerId自动从token获取，管理员ownerId需指定) 
Response: data = Hotel Schema (201 Created) 
Permission: merchant, admin

GET /api/hotels 
Desc: 用户端酒店列表（支持筛选、上滑加载） 
Request: body = Query: location(string), keyword(string), checkIn(date), checkOut(date), starRating(integer), facilities(array<string>), priceMin(number), priceMax(number), page(integer 默认1), limit(integer 默认10) 
Response: data = { "hotels": array<Hotel Schema> (populate roomTypes, 按价格排序), "total": integer, "page": integer } (200 OK) 
Permission: 无

GET /api/hotels/:id 
Desc: 酒店详情（包括房型列表，按价格低到高） 
Request: params = id(string) 
Response: data = Hotel Schema (populate roomTypes 和 promotions) (200 OK) 
Permission: 无

PATCH /api/hotels/:id 
Desc: 商户/管理员编辑酒店（商户仅能编辑自己的，status=pending或rejected时可编辑，管理员无限制） 
Request: params = id(string) body = Partial<Hotel Schema> (可更新字段，如name、address等) 
Response: data = Hotel Schema (200 OK) 
Permission: merchant, admin

PATCH /api/hotels/:id/approve 
Desc: 管理员审核通过（status → approved） 
Request: params = id(string) 
Response: data = Hotel Schema (200 OK) 
Permission: admin

PATCH /api/hotels/:id/reject 
Desc: 管理员审核不通过 
Request: params = id(string) Body: { "rejectReason": string } 
Response: data = Hotel Schema (200 OK) 
Permission: admin

PATCH /api/hotels/:id/offline 
Desc: 管理员下线（status → offline，可恢复） 
Request: params = id(string) 
Response: data = Hotel Schema (200 OK) 
Permission: admin

PATCH /api/hotels/:id/online 
Desc: 管理员恢复上线（status → approved） 
Request: params = id(string) 
Response: data = Hotel Schema (200 OK) 
Permission: admin

GET /api/hotels/admin 
Desc: 管理员酒店列表（审核列表，支持状态过滤） 
Request: query = status(enum: pending/approved/rejected/offline), page(integer), limit(integer) 
Response: data = { "hotels": array<Hotel Schema>, "total": integer } (200 OK) 
Permission: admin

DELETE /api/hotels/:id 
Desc: 删除酒店（软删除，仅管理员） 
Request: body = Params: id(string) 
Response: data = { "message": "Deleted" } (200 OK) 
Permission: admin

### 3. 房型相关 API (Room)

POST /api/room 
Desc: 创建房型（关联酒店） 
Request: body = Room Schema (无id、createdAt、updatedAt) 
Response: data = Room Schema (201 Created) 
Permission: merchant, admin

GET /api/room/:id 
Desc: 获取单个房型 
Request: params = id(string) 
Response: data = Room Schema (200 OK) 
Permission: 无

PATCH /api/room/:id 
Desc: 更新房型（价格等） 
Request: params = id(string) Body: Partial<Room Schema> 
Response: data = Room Schema (200 OK) 
Permission: merchant, admin

DELETE /api/room/:id 
Desc: 删除房型 
Request: params = id(string) 
Response: data = { "message": "Deleted" } (200 OK) 
Permission: merchant, admin

### 4. 优惠相关 API (Promotion)

POST /api/promotions 
Desc: 创建优惠 
Request: body = Promotion Schema (无id、createdAt、updatedAt) 
Response: data = Promotion Schema (201 Created) 
Permission: merchant, admin

GET /api/promotions 
Desc: 优惠列表（可过滤） 
Request: body = Query: hotelId(string), roomTypeId(string) 
Response: data = array<Promotion Schema> (200 OK) 
Permission: 无

GET /api/promotions/:id 
Desc: 获取单个优惠 
Request: body = Params: id(string) 
Response: data = Promotion Schema (200 OK) 
Permission: 无

PATCH /api/promotions/:id 
Desc: 更新优惠 
Request: body = Params: id(string) Body: Partial<Promotion Schema> 
Response: data = Promotion Schema (200 OK) 
Permission: merchant/, dmin

DELETE /api/promotions/:id 
Desc: 删除优惠 
Request: body = Params: id(string) 
Response: data = { "message": "Deleted" } (200 OK) 
Permission: merchant, admin