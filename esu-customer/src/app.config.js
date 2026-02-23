
export default ({

  pages: [
    'pages/op1/op1'
    ,'pages/op11/op11',
    'pages/op12/op12','pages/op13/op13','pages/op14/op14',
    'pages/op15/op15','pages/op16/op16',
    'pages/login/login'
  ],
  window: {
     backgroundTextStyle: 'light',
    navigationBarBackgroundColor: '#fff',
    navigationBarTitleText: '易宿酒店预订',
    navigationBarTextStyle: 'black'
  },
  permission: {
    'scope.userLocation': {
      desc: '你的位置信息将用于自动填写当前城市'
    }
  },
  requiredPrivateInfos: ['getLocation']
})
