import { FACILITY_ICONS } from './facilities'

export const hotelList = [
  {
    id: 1,
    name: '智尚轻奢酒店(双峰一中店)',
    name_en: 'Zhishang Light Luxury Hotel',
    price: 130,
    originalPrice: 200,
    address: '双峰县双峰大道与迎宾路交叉口',
    district: '双峰县政府',
    distance: 300,
    stars: 4,
    score: 4.8,
    reviewCount: 495,
    collectCount: 5497,
    tags: ['环境优雅', '房间宽敞明亮', '干净整洁'],
    facilityIds: ['freeUpgrade', 'teaRoom', 'butler', 'chessRoom', 'freeWifi', 'freeParking', 'gym', 'luggage', 'frontDesk24h', 'laundry'],
    promotions: ['首住特惠 85折起', '新客体验钻石', '门店首单', '3项优惠'],
    img: 'https://picsum.photos/200/120?random=1',
    location: { lat: 27.456, lng: 112.198 },
    rooms: [
      { id: 101, name: '经典大床房', bed: '1.8米大床', area: '35㎡', capacity: '2人', floor: '5-12层', price: 130, originalPrice: 200, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=101' },
      { id: 102, name: '豪华双床房', bed: '1.2米双床', area: '42㎡', capacity: '2人', floor: '8-18层', price: 150, originalPrice: 230, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=102' },
      { id: 103, name: '行政套房', bed: '2米大床', area: '68㎡', capacity: '2人', floor: '20-25层', price: 280, originalPrice: 380, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=103' }
    ]
  },
  {
    id: 2,
    name: '洞庭春大酒店(双峰一中县政府店)',
    name_en: 'Dongtingchun Hotel',
    price: 176,
    originalPrice: 260,
    address: '双峰县双峰大道与蔡和森大道交叉口',
    district: '双峰县政府',
    distance: 150,
    stars: 4,
    score: 4.8,
    reviewCount: 372,
    collectCount: 2108,
    tags: ['服务不错', '全屋智能', '下次再来'],
    facilityIds: ['freeCancel', 'freeParking', 'butler'],
    promotions: ['送10倍携程积分', '新客体验钻石', '会员出行', '新春特惠券', '4项优惠'],
    img: 'https://picsum.photos/200/120?random=2',
    location: { lat: 27.458, lng: 112.200 },
    rooms: [
      { id: 201, name: '标准大床房', bed: '1.8米大床', area: '30㎡', capacity: '2人', floor: '3-8层', price: 176, originalPrice: 260, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=201' },
      { id: 202, name: '商务双床房', bed: '1.2米双床', area: '38㎡', capacity: '2人', floor: '5-12层', price: 196, originalPrice: 290, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=202' },
      { id: 203, name: '家庭套房', bed: '1.8米+1.2米', area: '55㎡', capacity: '3人', floor: '10-16层', price: 260, originalPrice: 350, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=203' }
    ]
  },
  {
    id: 3,
    name: '丰茂酒店(双峰一中店)',
    name_en: 'Fengmao Hotel',
    price: 189,
    originalPrice: 280,
    address: '双峰县双峰大道与国藩路交叉口',
    district: '双峰县政府',
    distance: 630,
    stars: 4,
    score: 4.6,
    reviewCount: 117,
    collectCount: 3457,
    tags: ['环境优雅', '服务热情', '性价比高'],
    facilityIds: ['freeParking', 'chessRoom', 'restaurant'],
    promotions: ['连住优惠', '新客专享'],
    img: 'https://picsum.photos/200/120?random=3',
    location: { lat: 27.462, lng: 112.205 },
    rooms: [
      { id: 301, name: '雅致大床房', bed: '1.8米大床', area: '32㎡', capacity: '2人', floor: '4-10层', price: 189, originalPrice: 280, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=301' },
      { id: 302, name: '舒适双床房', bed: '1.2米双床', area: '40㎡', capacity: '2人', floor: '6-14层', price: 209, originalPrice: 300, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=302' }
    ]
  },
  {
    id: 4,
    name: '维也纳国际酒店(双峰店)',
    name_en: 'Vienna International Hotel',
    price: 220,
    originalPrice: 350,
    address: '双峰县复兴路与蔡和森大道交汇处',
    district: '双峰县中心',
    distance: 800,
    stars: 5,
    score: 4.7,
    reviewCount: 623,
    collectCount: 4120,
    tags: ['欧式风格', '隔音好', '早餐丰富'],
    facilityIds: ['freeParking', 'gym', 'meetingRoom', 'laundry'],
    promotions: ['连住3晚7折', '会员专享价'],
    img: 'https://picsum.photos/200/120?random=4',
    location: { lat: 27.470, lng: 112.212 },
    rooms: [
      { id: 401, name: '高级大床房', bed: '1.8米大床', area: '38㎡', capacity: '2人', floor: '8-18层', price: 220, originalPrice: 350, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=401' },
      { id: 402, name: '豪华双床房', bed: '1.2米双床', area: '45㎡', capacity: '2人', floor: '10-20层', price: 250, originalPrice: 380, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=402' },
      { id: 403, name: '行政套房', bed: '2米大床', area: '70㎡', capacity: '2人', floor: '22-28层', price: 380, originalPrice: 520, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=403' }
    ]
  },
  {
    id: 5,
    name: '城市便捷酒店(双峰汽车西站店)',
    name_en: 'City Comfort Inn',
    price: 158,
    originalPrice: 199,
    address: '双峰县汽车西站旁',
    district: '双峰汽车西站',
    distance: 200,
    stars: 3,
    score: 4.5,
    reviewCount: 892,
    collectCount: 3012,
    tags: ['交通便利', '性价比高', '干净'],
    facilityIds: ['freeParking', 'luggage', 'wakeUp'],
    promotions: ['新客立减20', '延迟退房'],
    img: 'https://picsum.photos/200/120?random=5',
    location: { lat: 27.445, lng: 112.185 },
    rooms: [
      { id: 501, name: '标准大床房', bed: '1.5米大床', area: '25㎡', capacity: '2人', floor: '2-6层', price: 158, originalPrice: 199, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=501' },
      { id: 502, name: '标准双床房', bed: '1.0米双床', area: '28㎡', capacity: '2人', floor: '3-7层', price: 168, originalPrice: 219, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=502' }
    ]
  },
  {
    id: 6,
    name: '双峰宾馆',
    name_en: 'Shuangfeng Hotel',
    price: 280,
    originalPrice: 398,
    address: '双峰县蔡和森大道与国藩路交叉口',
    district: '双峰县政府',
    distance: 400,
    stars: 4,
    score: 4.3,
    reviewCount: 234,
    collectCount: 1567,
    tags: ['老牌酒店', '停车方便', '服务周到'],
    facilityIds: ['restaurant', 'meetingRoom', 'freeParking', 'chessRoom'],
    promotions: ['含双早', '周末不加价'],
    img: 'https://picsum.photos/200/120?random=6',
    location: { lat: 27.460, lng: 112.202 },
    rooms: [
      { id: 601, name: '商务大床房', bed: '1.8米大床', area: '35㎡', capacity: '2人', floor: '4-12层', price: 280, originalPrice: 398, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=601' },
      { id: 602, name: '商务双床房', bed: '1.2米双床', area: '40㎡', capacity: '2人', floor: '6-15层', price: 300, originalPrice: 420, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=602' }
    ]
  },
  {
    id: 7,
    name: 'OYO尊享酒店(双峰一中店)',
    name_en: 'OYO Premium Hotel',
    price: 145,
    originalPrice: 228,
    address: '双峰县双峰大道与和森路交叉口',
    district: '双峰县政府',
    distance: 550,
    stars: 3,
    score: 4.2,
    reviewCount: 158,
    collectCount: 890,
    tags: ['简约', '干净', '性价比'],
    facilityIds: ['freeWifi', 'frontDesk24h'],
    promotions: ['限时特惠', '连住优惠'],
    img: 'https://picsum.photos/200/120?random=7',
    location: { lat: 27.468, lng: 112.196 },
    rooms: [
      { id: 701, name: '简约大床房', bed: '1.5米大床', area: '22㎡', capacity: '2人', floor: '2-5层', price: 145, originalPrice: 228, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=701' },
      { id: 702, name: '简约双床房', bed: '1.0米双床', area: '26㎡', capacity: '2人', floor: '3-6层', price: 155, originalPrice: 248, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=702' }
    ]
  },
  {
    id: 8,
    name: '麗枫酒店(双峰汽车站店)',
    name_en: 'Lavande Hotel',
    price: 199,
    originalPrice: 299,
    address: '双峰县汽车东站对面',
    district: '双峰汽车东站',
    distance: 700,
    stars: 4,
    score: 4.7,
    reviewCount: 306,
    collectCount: 1876,
    tags: ['薰衣草主题', '香氛', '舒适'],
    facilityIds: ['freeParking', 'breakfast', 'gym'],
    promotions: ['首住7折', '送双早'],
    img: 'https://picsum.photos/200/120?random=8',
    location: { lat: 27.475, lng: 112.220 },
    rooms: [
      { id: 801, name: '香薰大床房', bed: '1.8米大床', area: '32㎡', capacity: '2人', floor: '5-14层', price: 199, originalPrice: 299, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=801' },
      { id: 802, name: '香薰双床房', bed: '1.2米双床', area: '38㎡', capacity: '2人', floor: '7-16层', price: 219, originalPrice: 329, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=802' }
    ]
  },
  {
    id: 9,
    name: '如家酒店(双峰国藩路店)',
    name_en: 'Home Inn',
    price: 120,
    originalPrice: 169,
    address: '双峰县国藩路与宾园路交叉口',
    district: '双峰县',
    distance: 950,
    stars: 2,
    score: 4.0,
    reviewCount: 421,
    collectCount: 1134,
    tags: ['经济', '干净', '位置好'],
    facilityIds: ['freeParking', 'luggage'],
    promotions: ['会员价', '积分兑换'],
    img: 'https://picsum.photos/200/120?random=9',
    location: { lat: 27.455, lng: 112.215 },
    rooms: [
      { id: 901, name: '经济大床房', bed: '1.5米大床', area: '18㎡', capacity: '2人', floor: '2-4层', price: 120, originalPrice: 169, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=901' },
      { id: 902, name: '经济双床房', bed: '1.0米双床', area: '22㎡', capacity: '2人', floor: '3-5层', price: 130, originalPrice: 189, breakfast: false, cancel: '不可取消', img: 'https://picsum.photos/200/150?random=902' }
    ]
  },
  {
    id: 10,
    name: '希尔顿欢朋酒店(双峰店)',
    name_en: 'Hampton by Hilton',
    price: 350,
    originalPrice: 499,
    address: '双峰县新城区迎宾路88号',
    district: '双峰新城区',
    distance: 1200,
    stars: 5,
    score: 4.9,
    reviewCount: 157,
    collectCount: 2345,
    tags: ['国际品牌', '高端', '服务好'],
    facilityIds: ['pool', 'gym', 'executiveLounge', 'meetingRoom'],
    promotions: ['新店开业5折', '含双早', '免费升级'],
    img: 'https://picsum.photos/200/120?random=10',
    location: { lat: 27.480, lng: 112.230 },
    rooms: [
      { id: 1001, name: '高级大床房', bed: '1.8米大床', area: '40㎡', capacity: '2人', floor: '8-18层', price: 350, originalPrice: 499, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=1001' },
      { id: 1002, name: '高级双床房', bed: '1.2米双床', area: '45㎡', capacity: '2人', floor: '10-20层', price: 380, originalPrice: 529, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=1002' },
      { id: 1003, name: '欢朋套房', bed: '2米大床', area: '70㎡', capacity: '2人', floor: '22-28层', price: 550, originalPrice: 720, breakfast: true, cancel: '免费取消', img: 'https://picsum.photos/200/150?random=1003' }
    ]
  }
]

export const getFacilitiesByIds = (ids) => {
  return ids.map(id => FACILITY_ICONS[id]).filter(Boolean)
}
