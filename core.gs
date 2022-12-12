include "locomotive.gs"
include	"meshobject.gs"
include "interface.gs"
include "orientation.gs"
include "multiplayergame.gs"
include "trainzassetsearch.gs"
include "soup.gs"
include "emptylib.gs"

class LocoCore isclass Locomotive
{
	tttelib TTTELocoLibrary;
	TTTEOnline onlineLibrary;
	Browser browser;
	Train train;
	
	
	int DetermineCarPosition(void);
	void SniffMyTrain(void);
	void ConfigureHeadcodeLamps(int headcode);
	void SetNamedFloatFromExisting(Soup in, Soup out, string tagName);
	thread void MultiplayerBroadcast(void);
	bool SoupHasTag(Soup testSoup, string tagName);
	TTTEOnline GetOnlineLibrary();
	
	Asset headlight_asset;               // headlight asset used by the loco
	Asset rear_headlight_asset;          // Backup headlight (not sure if we want this)
	Asset driver, fireman;               // fireman and driver meshes
	Asset ScriptAsset;
    StringTable strTable;
	Bogey[] myBogies; // Массив телег из конфига
	
  //Периодичность синхронизации действий в МП
  define float MP_UpdatePeriod = 0.1;
	
  //Побитовые флаги
  define int HEADCODE_BL = 1;
  define int HEADCODE_BC = 2;
  define int HEADCODE_BR = 4;
  define int HEADCODE_TC = 8;
  define int HEADCODE_NONE = 0;
  define int HEADCODE_ALL_LAMPS = HEADCODE_BL | HEADCODE_BC | HEADCODE_BR | HEADCODE_TC;
  define int HEADCODE_TAIL_LIGHTS = HEADCODE_BL | HEADCODE_BR;
  define int HEADCODE_BRANCH = HEADCODE_BL;
  define int HEADCODE_EXPRESS = HEADCODE_BL | HEADCODE_BR;
  define int HEADCODE_EXPRESS_FREIGHT = HEADCODE_TC | HEADCODE_BR;
  define int HEADCODE_EXPRESS_FREIGHT_2 = HEADCODE_BC | HEADCODE_BL;
  define int HEADCODE_EXPRESS_FREIGHT_3 = HEADCODE_TC | HEADCODE_BL;
  define int HEADCODE_GOODS = HEADCODE_BC | HEADCODE_BR;
  define int HEADCODE_LIGHT = HEADCODE_TC;
  define int HEADCODE_THROUGH_FREIGHT = HEADCODE_TC | HEADCODE_BC;
  define int HEADCODE_TVS = HEADCODE_BR;
  
  define int FEATURE_LAMPS        = 1 << 1;
  define int FEATURE_SMOKE        = 1 << 4;
  
  //Супы
  Soup myConfig;
  Soup ExtensionsContainer;
  Soup BogeyLiveryTextureOptions;
  Soup SmokeboxContainer;
  Soup ExtraLampsContainer;
  Soup SmokeEdits;
  
  bool[] ExtraLampVisibility;
  Asset[] ExtraLampAssets;
  
  //Хранит текущее состояние буферных фонарей
  int m_headCode;  

  int SupportedFeatureset = 0;
  int SupportedHeadcode = 0;
  
  public bool Compressor_run;

  public define int CAR_DERAILED = -1;
  public define int CAR_CENTER   =  0;
  public define int CAR_FRONT    =  1;
  public define int CAR_BACK     =  2;
  public define int CAR_SINGLE   =  3; // CAR_FRONT + CAR_BACK == CAR_SINGLE. Yes, this is intentional.

  int m_carPosition; // position of car in train - one of the options above

  //Математика
  float ApproxAtan2(float y, float x);
  WorldCoordinate RotatePoint(WorldCoordinate point, float rotateangle);
  Orientation LookAt(WorldCoordinate A, WorldCoordinate B);
  Orientation DeltaRot(Orientation From, Orientation To);
  float rad_range(float in_x);
  float clamp(float x, float lower, float upper);
  
  //Побитовые утилиты
  bool FlagTest(int flags, int mask)
  {
    return flags == mask;
  }

  void SetFeatureSupported(int feature)
  {
    SupportedFeatureset = SupportedFeatureset | feature;
  }

  void SetHeadcodeSupported(int flag)
  {
    SupportedHeadcode = SupportedHeadcode | flag;
  }

  bool GetFeatureSupported(int features)
  {
    return (SupportedFeatureset & features) == features;
  }

  bool GetHeadcodeSupported(int flags)
  {
    return (SupportedHeadcode & flags) == flags;
  }

  // ============================================================================
  // Name: Init()
  // Desc: The Init function is called when the object is created
  // ============================================================================
  public void Init(Asset asset) // Let's keep the init at the top for ease of access
  {
    inherited(asset);
    TTTELocoLibrary = cast<tttelib>World.GetLibrary(asset.LookupKUIDTable("LocoCore"));
    ScriptAsset = World.GetLibrary(asset.LookupKUIDTable("LocoCore")).GetAsset();
    myConfig = asset.GetConfigSoup();
    ExtensionsContainer = asset.GetConfigSoup().GetNamedSoup("extensions");

    // ****************************************************************************/
   // Grab assets from the Locomotive
   // ****************************************************************************/
  strTable = ScriptAsset.GetStringTable(); // String table to be used for obtaining information inside the Config

  myBogies = me.GetBogeyList(); // Grab all of the bogies on the locomotive, specifically for swapping texture purposes.

  ExtraLampsContainer = ExtensionsContainer.GetNamedSoup("extra-lamps");
  BogeyLiveryTextureOptions = ExtensionsContainer.GetNamedSoup("bogey-livery-textures");

  //check lamp support, a bit hacky
  Soup MeshTable = myConfig.GetNamedSoup("mesh-table");
  int i;
  for(i = 0; i < MeshTable.CountTags(); i++)
  {
    Soup mesh = MeshTable.GetNamedSoup(MeshTable.GetIndexedTagName(i));
    Soup effects = mesh.GetNamedSoup("effects");
    int j;
    for(j = 0; j < effects.CountTags(); j++)
    {
      string effect = effects.GetIndexedTagName(j);
      if(effect == "lamp_tc") SetHeadcodeSupported(HEADCODE_TC);
      else if (effect == "lamp_bl") SetHeadcodeSupported(HEADCODE_BL);
      else if (effect == "lamp_bc") SetHeadcodeSupported(HEADCODE_BC);
      else if (effect == "lamp_br") SetHeadcodeSupported(HEADCODE_BR);
    }
  }
  if(SupportedHeadcode != 0 or ExtraLampsContainer.CountTags()) SetFeatureSupported(FEATURE_LAMPS);

  //liverytextureoptions defines the texture autofill behavior
  //SUPPORTED OPTIONS: none, diffusenormal, pbrstandard

  //set initial extra lamp states to none
  if(ExtraLampsContainer)
  {
    int TagCount = ExtraLampsContainer.CountTags();
    ExtraLampAssets = new Asset[TagCount];
    ExtraLampVisibility = new bool[TagCount];
    //int i;
    for(i = 0; i < TagCount; i++)
    {
      string effectName = ExtraLampsContainer.GetIndexedTagName(i);
      MeshObject lampMesh = GetFXAttachment(effectName);
      ExtraLampVisibility[i] = false;
      if(lampMesh)
      {
        ExtraLampAssets[i] = lampMesh.GetAsset();
        SetFXAttachment(effectName, null);
      }
      else
        ExtraLampAssets[i] = null;
    }
  }

  SmokeboxContainer = ExtensionsContainer.GetNamedSoup("smokeboxes");

  SmokeEdits = Constructors.NewSoup();
  int ParticleCount = 0;
  int curTag;
  for(curTag = 0; curTag < myConfig.CountTags(); curTag++)
  {
    string tagName = myConfig.GetIndexedTagName(curTag);
    if(TrainUtil.HasPrefix(tagName, "smoke"))
    {
      SetFeatureSupported(FEATURE_SMOKE);
      Soup curSmoke = myConfig.GetNamedSoup(tagName);

      Soup NewContainer = Constructors.NewSoup();
      NewContainer.SetNamedTag("active", false); //whether to override
      NewContainer.SetNamedTag("expanded", false);
      SetNamedFloatFromExisting(curSmoke, NewContainer, "rate");
      SetNamedFloatFromExisting(curSmoke, NewContainer, "velocity");
      SetNamedFloatFromExisting(curSmoke, NewContainer, "lifetime");
      SetNamedFloatFromExisting(curSmoke, NewContainer, "minsize");
      SetNamedFloatFromExisting(curSmoke, NewContainer, "maxsize");

      //TrainzScript.Log(NewContainer.AsString());
      SmokeEdits.SetNamedSoup((string)ParticleCount, NewContainer);
      ParticleCount++;
    }
  }


  AddHandler(me, "Interface", "LayoutChanged", "UpdateInterfacePositionHandler");

  //Multiplayer Message! Important!
  AddHandler(me, "TTTELocomotiveMP", "update", "MPUpdate");

  if(MultiplayerGame.IsActive()){
    MultiplayerBroadcast();
  }

  // ****************************************************************************/
 // Define Camera Handlers for hiding/showing the low poly exterior cab on steam locos.
 // ****************************************************************************/
  AddHandler(Interface, "Camera", "Internal-View", "CameraInternalViewHandler");
  AddHandler(Interface, "Camera", "External-View", "CameraInternalViewHandler");
  AddHandler(Interface, "Camera", "Tracking-View", "CameraInternalViewHandler");
  AddHandler(Interface, "Camera", "Roaming-View", "CameraInternalViewHandler");
  AddHandler(Interface, "Camera", "Target-Changed", "CameraTargetChangedHandler");


  //create the browser menu - this could be changed later to link to a pantograph or keybind
 // createMenuWindow();
 // ScanBrowser();
 // BrowserThread();

  Soup KUIDTable = myConfig.GetNamedSoup("kuid-table");

  if(SoupHasTag(KUIDTable, "lamp")) headlight_asset = GetAsset().FindAsset("lamp");
  m_carPosition = DetermineCarPosition();


   // message handlers for ACS entry points and tail lights
  AddHandler(me, "Vehicle", "Coupled", "VehicleCoupleHandler");
  AddHandler(me, "Vehicle", "Decoupled", "VehicleDecoupleHandler");
  AddHandler(me, "Vehicle", "Derailed", "VehicleDerailHandler");
  // lashed on as it happens to do the right thing
  AddHandler(me, "World", "ModuleInit", "VehicleDecoupleHandler");
  AddHandler(me, "World", "ModuleInit", "ModuleInitHandler");

  // ACS callback handler
  AddHandler(me, "ACScallback", "", "ACShandler");

  // headcode / reporting number handler

  // handler necessary for tail lights
  AddHandler(me, "Train", "Turnaround", "TrainTurnaroundHandler");

  // Handler for Secondary Whistle PFX
  // AddHandler(me.GetMyTrain(), "Train", "NotifyHorn", "WhistleMonitor");

  //listen for user change messages in the online group
  //although this message is sent to OnlineGroup objects, it is forwarded to the online group library through Sniff
  if(GetOnlineLibrary())
  {
    AddHandler(GetOnlineLibrary(), "TTTEOnline", "UsersChange", "UsersChangeHandler");
  }

	train = me.GetMyTrain(); // Get the train
	SniffMyTrain(); // Then sniff it

  }

  // ============================================================================
  // Name: SetNamedFloatFromExisting()
  // Desc: Utility for copying soups.
  // ============================================================================
  void SetNamedFloatFromExisting(Soup in, Soup out, string tagName)
  {
    if(in.GetIndexForNamedTag(tagName) != -1) out.SetNamedTag(tagName, Str.UnpackFloat(in.GetNamedTag(tagName)));
  }

  // ============================================================================
  // Name: SoupHasTag()
  // Desc: Determine if a Soup contains a tag.
  // ============================================================================
  bool SoupHasTag(Soup testSoup, string tagName)
  {
    if(testSoup.GetIndexForNamedTag(tagName) == -1)
    {
      return false;
    }
    //return false if it doesnt exist, otherwise return true
    return true;
  }

  // ============================================================================
  // Name: DetermineCarPosition()
  // Desc: Определяет нашу позицию в этом составе
  // ============================================================================
  int DetermineCarPosition()
  {
    //Interface.Print("I entered Determine Car position");

    Train consist;
    Vehicle[] cars;
    int rval = CAR_CENTER;

    consist = GetMyTrain();
    cars = consist.GetVehicles();
    if (me == cars[0])
    {
      rval = rval + CAR_FRONT;
    }
    if (me == cars[cars.size() - 1])
    {
      rval = rval + CAR_BACK;
    }
    return rval;
  }
  
  // ============================================================================
  // Name: Compressor()
  // Desc: Логика работы компрессора
  // ============================================================================
 public void Compressor(bool CS_W)
{
	while(CS_W)
	{
		if (!Compressor_run and me.GetEngineParam("main-reservoir-pressure") < 750)
		{
			Interface.Print("МК1 ВКЛ");
			Sleep (0.7); 
			me.SetCompressorEfficiency (0.6);
			Compressor_run = true;
		}
		if (me.GetEngineParam("main-reservoir-pressure") > 899 and Compressor_run)
		{
			Interface.Print("МК1 ВЫКЛ");
			Sleep (0.1); 
			me.SetCompressorEfficiency (-0.065);
			Compressor_run = false;
		}
	Sleep (0.001);
	}
}

  // ============================================================================
  // Math Utility Functions
  // Desc: Trig functions and stuff.
  // ============================================================================

  public define float PI_2 = 3.14159265/2.0;

  float ApproxAtan(float z)
  {
      float n1 = 0.97239411;
      float n2 = -0.19194795;
      return (n1 + n2 * z * z) * z;
  }

  float ApproxAtan2(float y, float x)
  {
      if (x != 0.0)
      {
          if (Math.Fabs(x) > Math.Fabs(y))
          {
              float z = y / x;
              if (x > 0.0)
              {
                  // atan2(y,x) = atan(y/x) if x > 0
                  return ApproxAtan(z);
              }
              else if (y >= 0.0)
              {
                  // atan2(y,x) = atan(y/x) + PI if x < 0, y >= 0
                  return ApproxAtan(z) + Math.PI;
              }
              else
              {
                  // atan2(y,x) = atan(y/x) - PI if x < 0, y < 0
                  return ApproxAtan(z) - Math.PI;
              }
          }
          else // Use property atan(y/x) = PI/2 - atan(x/y) if |y/x| > 1.
          {
              float z = x / y;
              if (y > 0.0)
              {
                  // atan2(y,x) = PI/2 - atan(x/y) if |y/x| > 1, y > 0
                  return -ApproxAtan(z) + PI_2;
              }
              else
              {
                  // atan2(y,x) = -PI/2 - atan(x/y) if |y/x| > 1, y < 0
                  return -ApproxAtan(z) - PI_2;
              }
          }
      }
      else
      {
          if (y > 0.0) // x = 0, y > 0
          {
              return PI_2;
          }
          else if (y < 0.0) // x = 0, y < 0
          {
              return -PI_2;
          }
      }
      return 0.0; // x,y = 0. Could return NaN instead.
  }
  define int SINETIMEOUT = 512;

float fast_sin(float in_x)
  {
    float x = in_x;
    //always wrap input angle to -PI..PI
    if(x and x != 0.0)
    {
      int Timeout = 0;
      if (x < -(float)Math.PI)
          while(Timeout < SINETIMEOUT and x < -(float)Math.PI)
          {
            x = x + (float)Math.PI * 2;
            Timeout++;
          }
      if (x > (float)Math.PI)
          while(Timeout < SINETIMEOUT and x > (float)Math.PI)
          {
            x = x - (float)Math.PI * 2;
            Timeout++;
          }
    }

    if (x < 0)
    {
        float sin = (4 / (float)Math.PI) * x + (4 / (float)(Math.PI * Math.PI)) * x * x;

        if (sin < 0)
            return .225 * (sin * -sin - sin) + sin;

        return .225 * (sin * sin - sin) + sin;
    }
    else
    {
        float sin = (4 / (float)Math.PI) * x - (4 / (float)(Math.PI * Math.PI)) * x * x;

        if (sin < 0)
            return .225 * (sin * -sin - sin) + sin;

        return .225 * (sin * sin - sin) + sin;
    }
    return 0.0;
  }

  float fast_cos(float x)
  {
    return fast_sin((Math.PI / 2.0) - x);
  }

  float rad_range(float in_x)
  {
    float x = in_x;
    if(x and x != 0.0)
    {
      int Timeout = 0;
      if (x < -(float)Math.PI)
          while(Timeout < SINETIMEOUT and x < -(float)Math.PI)
          {
            x = x + (float)Math.PI * 2;
            Timeout++;
          }
      if (x > (float)Math.PI)
          while(Timeout < SINETIMEOUT and x > (float)Math.PI)
          {
            x = x - (float)Math.PI * 2;
            Timeout++;
          }
    }
    return x;
  }

  WorldCoordinate RotatePoint(WorldCoordinate point, float rotateangle)
  {
    WorldCoordinate newpoint = new WorldCoordinate();
    float s = fast_sin(rotateangle);
    float c = fast_cos(rotateangle);
    newpoint.x = point.x * c - point.y * s;
    newpoint.y = point.x * s + point.y * c;
    newpoint.z = point.z;
    return newpoint;
  }
  
  
  Orientation LookAt(WorldCoordinate A, WorldCoordinate B)
  {
    float d_x = B.x - A.x;
    float d_y = B.y - A.y;
    float d_z = B.z - A.z;
    WorldCoordinate delta = new WorldCoordinate();
    delta.x = d_x;
    delta.y = d_y;
    delta.z = d_z;

    Orientation ang = new Orientation();
    float rot_z = ApproxAtan2(d_y, d_x);
    ang.rz = rot_z- Math.PI; // - Math.PI
    WorldCoordinate relative = RotatePoint(delta, -rot_z);
    ang.ry = ApproxAtan2(relative.z, relative.x);
    return ang;
  }

  Orientation DeltaRot(Orientation From, Orientation To)
  {
    Orientation ang = new Orientation();
    ang.rx = To.rx - From.rx;
    ang.ry = To.ry - From.ry;
    ang.rz = To.rz - From.rz;
    return ang;
  }
  
  float clamp(float x, float lower, float upper)
  {
    float ret = x;
    if(ret < lower)
      ret = lower;
    else if(ret > upper)
      ret = upper;
    return ret;
  }

  // ============================================================================
  // Name: SniffMyTrain()
  // Desc: Поддерживать доступ к текущему поезду для прослушивания сообщений «Train»
  // ============================================================================
  void SniffMyTrain()
  {
    Train oldTrain = train;
	  //Interface.Print("I entered Sniff");

    train = GetMyTrain();

    if(oldTrain)
    {
      if(oldTrain != train)
      {
        Sniff(oldTrain, "Train", "", false);
        Sniff(train, "Train", "", true);
      }
    }
    else
    {
      Sniff(train, "Train", "", true);
    }
  }
  
   // ============================================================================
  // Name: ConfigureHeadcodeLamps()
  // Desc: Sets the lamp arrangement from the headcode variable
  // Lamp names are fairly self-explanatory, but here is the full name for each lamp:
  // lamp_tc  = Top Center , lamp_bc = Bottom Center , Lamp_bl = Bottom Left , lamp_br = Bottom Right
  // ============================================================================
  void ConfigureHeadcodeLamps(int headcode)
  {
    // We are going to use SetFXAttachment to set the lamps in the correct positions.
    // This is using the names of the lamps that are in the effects container of the locomotive.
    if ((headcode & HEADCODE_BL) != 0) SetFXAttachment("lamp_bl", headlight_asset);
    else SetFXAttachment("lamp_bl", null);
    if ((headcode & HEADCODE_BC) != 0) SetFXAttachment("lamp_bc", headlight_asset);
    else SetFXAttachment("lamp_bc", null);
    if ((headcode & HEADCODE_BR) != 0) SetFXAttachment("lamp_br", headlight_asset);
    else SetFXAttachment("lamp_br", null);
    if ((headcode & HEADCODE_TC) != 0) SetFXAttachment("lamp_tc", headlight_asset);
    else SetFXAttachment("lamp_tc", null);

  }
  
   // ============================================================================
  // Name: MultiplayerBroadcast()
  // Desc: Поток, который объединяет всю информацию о локомотивах с другими клиентами МП.
  // ============================================================================

  //Этот раздел кода управляет многопользовательской игрой, используя какой-то эпический продвинутый Soup.
	thread void MultiplayerBroadcast()
	{
		while(true)
		{
			//ПРОВЕРЬ ПРАВО СОБСТВЕННОСТИ КЛИЕНТА, ИНАЧЕ БУДЕТ ЗАСОРЕНО
			DriverCharacter driver = me.GetMyTrain().GetActiveDriver();
			if (MultiplayerGame.IsActive() and driver and driver.IsLocalPlayerOwner())
			{
				//Этот поток будет упаковывать данные и отправлять их на сервер для чтения.
				Soup senddata = Constructors.NewSoup();
				senddata.SetNamedTag("headcode",m_headCode);
				senddata.SetNamedTag("id",me.GetGameObjectID());
				MultiplayerGame.BroadcastGameplayMessage("TTTELocomotiveMP", "update", senddata);
			}
			Sleep(MP_UpdatePeriod); // Не перебарщивай с данными
		}
	}

  //Online fuctions
  TTTEOnline GetOnlineLibrary()
  {
    if(TTTELocoLibrary)
      return TTTELocoLibrary.GetOnlineLibrary();

    return null;
  }

  OnlineGroup GetSocialGroup()
  {
    TTTEOnline onlineLibrary = GetOnlineLibrary();
    return onlineLibrary.GetPersonalGroup();
  }

  // ============================================================================
  // Name: MPUpdate()
  // Desc: Client side MP information handler.
  // ============================================================================

	//receives and handles multiplayer messages
	public void MPUpdate(Message msg)
	{
		Soup ReceivedData = msg.paramSoup;

		DriverCharacter driver = me.GetMyTrain().GetActiveDriver();
		if(driver.IsLocalPlayerOwner() == false and me.GetGameObjectID().DoesMatch(ReceivedData.GetNamedTagAsGameObjectID("id"))) //this might not work idk
		{
			Interface.Print("Data Confirmed!");
      int Rheadcode = ReceivedData.GetNamedTagAsInt("headcode");

      if(m_headCode != Rheadcode)
      {
        m_headCode = Rheadcode;
        ConfigureHeadcodeLamps(m_headCode);
      }

			//bool Rwheesh = ReceivedData.GetNamedTagAsBool("wheesh");

			//if(Rwheesh and !Wheeshing)
			//{
			//	PostMessage(me, "pfx", "+4",0.0);
			//} else if(!Rwheesh and Wheeshing) {
			//	PostMessage(me, "pfx", "-4",0.0);
			//}
		}
	}

	
};

