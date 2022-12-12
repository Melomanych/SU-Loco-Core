include "Library.gs"
include "Browser.gs"

class InviteInfo
{
    public string username;
    public string groupCookie;

};

class EyeFrame
{
	public float x;
	public float y;
};

class TTTEOnline isclass Library
{
	int EYEBUFFER_SIZE = 30;
public define float RECORD_INTERVAL = 0.04;

    OnlineAccess OA;
	int OAStatus = -1;

    Browser browser;
	Browser controlBrowser;

	Soup FacesContainer;

    InviteInfo[] invitations;

	void RemoveInvitation(int idx)
	{
		InviteInfo[] new_invitations = new InviteInfo[0];
		int i;
		for(i = 0; i < invitations.size(); i++)
		{
			if(i != idx)
				new_invitations[new_invitations.size()] = invitations[i]; 
		}

		invitations = new_invitations;
	}

	EyeFrame[] frameBuffer;
	int faceSelection = 0;

    void ShowBrowser();
	void CloseBrowser();

    public void RefreshBrowserHTML();
	public void RefreshControlBrowserHTML();
	string LoadingHTML();
	string MainHTML();
    string GroupHTML();
	string ControlHTML();

    thread void BrowserThread();
	thread void ControlThread();

    void StatusUpdate(Message msg);

	OnlineGroup personalGroup;
    OnlineGroup activeGroup;

    public void SaveGroupCookie();
	void ClearGroupCookie();
	void LoadPreviousGroup();

	public OnlineGroup GetPersonalGroup()
	{
		return personalGroup;
	}
	public OnlineGroup CreateGroup();

	void JoinGroup(string cookie);
	public void LeaveGroup();

    public void Init(Asset asset)
    {
        inherited(asset);
        invitations = new InviteInfo[0];
		FacesContainer = Constructors.NewSoup();

		AddSystemMenuIcon(GetAsset().FindAsset("system-icon"), GetAsset().GetStringTable().GetString("system-icon"), "Party");
		
		OA = GetOnlineAccess();
        AddHandler(OA, "OnlineAccess", "ReceiveMessage", "HandleReceiveMessage");
		AddHandler(OA, "OnlineAccess", "StatusChange", "StatusUpdate");
		
		//Sniff(OA, "OnlineAccess", "StatusChange", true);
		OA.Connect();
		OAStatus = OA.GetStatus();

		AddHandler(me, "Interface", "ClickSystemButton", "OnClickSystemButton");
		
		AddHandler(me, "OnlineGroup", "UsersChange", "UsersChangeHandler");
		AddHandler(me, "OnlineGroup", "ReceiveMessage", "ReceiveGroupMessageHandler");

		frameBuffer = new EyeFrame[0];
		BrowserThread();
    }

    void OnClickSystemButton(Message msg)
	{
		if (msg.src != me)
			return;

		if(!browser)
			ShowBrowser();
		else
			CloseBrowser();
	}

    void ShowBrowser()
	{
		browser = Constructors.NewBrowser();
		browser.SetCloseEnabled(false);
		browser.SetWindowPosition(Interface.GetDisplayWidth()-440, 0); //Interface.GetMenuBarHeight()
        browser.SetWindowSize(300, 350);
        //browser.SetWindowStyle(Browser.STYLE_SLIM_FRAME);
        browser.SetWindowVisible(true);
		RefreshBrowserHTML();

		controlBrowser = Constructors.NewBrowser();
		controlBrowser.SetCloseEnabled(false);
		controlBrowser.SetWindowPosition(Interface.GetDisplayWidth() - 440 - 300, 0); //Interface.GetMenuBarHeight()
        controlBrowser.SetWindowSize(300, 350);
        //browser.SetWindowStyle(Browser.STYLE_SLIM_FRAME);
        controlBrowser.SetWindowVisible(true);
		RefreshControlBrowserHTML();

		ControlThread();
	}

	void CloseBrowser()
	{
		browser = null;
		controlBrowser = null;
	}


    public void SaveGroupCookie()
	{
		Soup data = Constructors.NewSoup();
		data.SetNamedTag("cookie", activeGroup.GetOnlineGroupCookie());
		OA.SetLocalData("TTTETrainzParty-cookie", data);
	}

	void ClearGroupCookie()
	{
		Soup data = Constructors.NewSoup();
		data.SetNamedTag("cookie", "");
		OA.SetLocalData("TTTETrainzParty-cookie", data);
	}

	void LoadPreviousGroup()
	{
		Soup data = Constructors.NewSoup();
		int result = OA.GetLocalData("TTTETrainzParty-cookie", data);
		if(result == 0)
		{
			string cookie = data.GetNamedTag("cookie");
			if(cookie and cookie.size())
			{
				JoinGroup(cookie);
			}
		}
		else
			TrainzScript.Log("No iTrainz Party data found, result code " + (string)result);
	}

    void StatusUpdate(Message msg)
    {
		OAStatus = OA.GetStatus();
		if(OAStatus == OnlineAccess.MODE_ONLINE)
		{
			LoadPreviousGroup();
			if(!personalGroup)
			{
				personalGroup = OA.CreateGroup(0);
				Sniff(personalGroup, "OnlineGroup", "UsersChange", true);
				Sniff(personalGroup, "OnlineGroup", "ReceiveMessage", true);
			}
		}
		RefreshBrowserHTML();
    }

	void UsersChangeHandler(Message msg)
	{
		TrainzScript.Log("Group users changed");
		// if(activeGroup)
		// {
		// 	if(!activeGroup.HasUser(OA.GetUsername()))
		// 		LeaveGroup();
		// }
		PostMessage(me, "TTTEOnline", "UsersChange", 0.0);
	}

	void HandleGroupMessage(string sourceUsername, Soup messageData)
	{
		//TrainzScript.Log("RECEIVED ONLINE MESSAGE");
		//TrainzScript.Log(messageData.AsString());

		string type = messageData.GetNamedTag("type");
		if(type == "update")
		{
		  messageData.SetNamedTag("username", sourceUsername);
		  PostMessage(me, "TTTEOnline", "Update", messageData, 0.0);
		}
		else if(type == "locoDesc")
		{
		  string targetUser = messageData.GetNamedTag("targetUser");
		  Str.ToLower(targetUser);
		  string username = OA.GetUsername();
		  Str.ToLower(username);

		  if(targetUser == username)
		  {
			FacesContainer = messageData.GetNamedSoup("facesContainer");

			EYEBUFFER_SIZE = 30;
			RefreshControlBrowserHTML();
			//if(controlBrowser)
				//controlBrowser.SetElementProperty("packetInterval", "value", "30");
		  }
		}
	}

	void ReceiveGroupMessageHandler(Message msg)
	{
		while (personalGroup)
		{
		  int result;
		  string sourceUsername = "";
		  Soup messageData = Constructors.NewSoup();

		  result = personalGroup.CollectMessage(sourceUsername, messageData);
		  
		  if (result != OnlineAccess.RESULT_OK)
			break;
		  
		  if (sourceUsername == "")
			break;


		  HandleGroupMessage(sourceUsername, messageData);
		}

		while (activeGroup)
		{
		  int result;
		  string sourceUsername = "";
		  Soup messageData = Constructors.NewSoup();

		  result = activeGroup.CollectMessage(sourceUsername, messageData);
		  
		  if (result != OnlineAccess.RESULT_OK)
			break;
		  
		  if (sourceUsername == "")
			break;

		  HandleGroupMessage(sourceUsername, messageData);
		}
	}

    void HandleReceiveMessage(Message msg)
    {
      bool changed = false;
      
      while (true)
      {
        int result;
        string sourceUsername = "";
        Soup messageData = Constructors.NewSoup();
        
        result = OA.CollectMessage(sourceUsername, messageData);
        
        if (result != OnlineAccess.RESULT_OK)
          break;
        
        if (sourceUsername == "")
          break;

        InviteInfo info = new InviteInfo();
        
        info.username = sourceUsername;
        info.groupCookie = messageData.GetNamedTag("groupCookie");

		if(info.groupCookie != "")
		{
			invitations[invitations.size()] = info;
			changed = true;
		}
		else
		{
			Interface.ShowMessageBox(me, "Received an invite with an invalid group cookie. Ask the sender to restart their game.", true, "TTTEOnline", "invalidCookie");
		}
      }

      if(changed)
        RefreshBrowserHTML();
    }
    
	public void RefreshBrowserHTML()
	{
		if(browser)
		{
			if(OAStatus == OnlineAccess.MODE_ONLINE)
			{
				if(activeGroup)
					browser.LoadHTMLString(GetAsset(), GroupHTML());
				else
				    browser.LoadHTMLString(GetAsset(), MainHTML());
			}
			else
				browser.LoadHTMLString(GetAsset(), LoadingHTML());
		}
	}

	public void RefreshControlBrowserHTML()
	{
		TrainzScript.Log("refreshing control browser");
		if(controlBrowser)
		{
			controlBrowser.LoadHTMLString(GetAsset(), ControlHTML());
			controlBrowser.ResizeHeightToFit();

			controlBrowser.SetElementProperty("packetInterval", "value", (string)EYEBUFFER_SIZE);
		}
	}

    string LoadingHTML()
	{
		HTMLBuffer output = HTMLBufferStatic.Construct();
		output.Print("<html><body>");
		switch(OAStatus)
		{
			default:
			case OnlineAccess.MODE_DISABLED:
				output.Print("Disabled.");
				break;
			case OnlineAccess.MODE_OFFLINE:
				output.Print("Offline.");
				break;
			case OnlineAccess.MODE_FAILED:
			case OnlineAccess.MODE_AUTH_FAILED:
			case OnlineAccess.MODE_DENIED_LOCAL:
			case OnlineAccess.MODE_INTERRUPTED:
				output.Print("Connection failed.");
				break;
			case OnlineAccess.MODE_CONNECTING:
				output.Print("Connecting...");
				break;
		}

		if(OAStatus != OnlineAccess.MODE_CONNECTING)
		{
			//output.Print("Retry");
		}
		output.Print("</body></html>");
		return output.AsString();
	}

	string MainHTML()
	{
		HTMLBuffer output = HTMLBufferStatic.Construct();
		output.Print("<html><body>");

		output.Print("Your myTrainz username is: " + OA.GetUsername());
		output.Print("<br>");
        output.Print("Your invitations:");
		output.Print("<br>");

        output.Print("<table>");

        bool rowParity = false;

        int i;
        for(i = 0; i < invitations.size(); i++)
        {
            InviteInfo info = invitations[i];

            rowParity = !rowParity;
            if (rowParity)
              output.Print("<tr bgcolor=#0E2A35 height=20>");
            else
              output.Print("<tr bgcolor=#05171E height=20>");

            output.Print("<td width=300><a href='live://accept/" + (string)i + "'>" + info.username + "</a></td>");

            output.Print("</tr>");
        }
        output.Print("</table>");


		//output.Print("Online.");
		//output.Print("<a href='live://create_group'>Create New Group</a>");
		output.Print("</body></html>");
		return output.AsString();
	}

	
define int Joystick_Size = 75;
define float Joystick_Range = 44.0;
  string GetJoystickContentHTML()
  {
    HTMLBuffer output = HTMLBufferStatic.Construct();
    output.Print("<html><body>");
    output.Print("<img kuid='<kuid:414976:104990>' width=" + (string)Joystick_Size + " height=" + (string)Joystick_Size + ">");
    output.Print("</body></html>");

    return output.AsString();
  }

  void PushFrame(float x, float y)
  {
	  EyeFrame frame = new EyeFrame();
	  frame.x = x;
	  frame.y = y;

	  frameBuffer[frameBuffer.size()] = frame;
	  if(frameBuffer.size() >= EYEBUFFER_SIZE)
	  {
		TrainzScript.Log("pushing packet (size " + EYEBUFFER_SIZE + ")");
		Soup msg = Constructors.NewSoup();
		msg.SetNamedTag("type", "update");

		msg.SetNamedTag("packetSize", EYEBUFFER_SIZE);
		msg.SetNamedTag("faceSelection", faceSelection);

		float dccValue = Str.ToFloat(controlBrowser.GetElementProperty("dcc", "value"));
		msg.SetNamedTag("dccValue", dccValue);
		TrainzScript.Log("SETTING DCC VALUE " + (string)dccValue);

		int i;
		for(i = 0; i < frameBuffer.size(); i++)
		{
			EyeFrame frame = frameBuffer[i];

			Soup frameSoup = Constructors.NewSoup();
			frameSoup.SetNamedTag("eyeX", frame.x);
			frameSoup.SetNamedTag("eyeY", frame.y);
			msg.SetNamedSoup((string)i, frameSoup);
		}

		activeGroup.PostMessage(msg);

		frameBuffer = new EyeFrame[0];
	  }
  }

  thread void JoystickThread()
  {
    int BrowserCenterX = browser.GetWindowLeft() + (browser.GetWindowWidth() / 2);
    int BrowserCenterY = browser.GetWindowTop() + (browser.GetWindowHeight() / 2);
    int HalfSize = Joystick_Size / 2;
    Browser Joystick = Constructors.NewBrowser();
    Joystick.SetCloseEnabled(false);
    Joystick.LoadHTMLString(GetAsset(), GetJoystickContentHTML());
    //Joystick.SetWindowStyle(Browser.STYLE_NO_FRAME);
    Joystick.SetWindowStyle(Browser.STYLE_POPOVER);
    Joystick.SetWindowPriority(Browser.BP_Window); //must be called after style
    //Joystick.SetWindowStyle(Browser.STYLE_SLIM_FRAME);
    Joystick.SetMovableByDraggingBackground(true);
  	Joystick.SetWindowPosition(BrowserCenterX - HalfSize, BrowserCenterY - HalfSize);
  	Joystick.SetWindowSize(Joystick_Size, Joystick_Size);
  	Joystick.SetWindowVisible(true);
    while(activeGroup)
    {
      Joystick.BringToFront();
      int BrowserTop = browser.GetWindowTop();
      int BrowserBottom = browser.GetWindowBottom();
      int BrowserLeft = browser.GetWindowLeft();
      int BrowserRight = browser.GetWindowRight();
      int JoystickTop = Joystick.GetWindowTop();
      int JoystickBottom = Joystick.GetWindowBottom();
      int JoystickLeft = Joystick.GetWindowLeft();
      int JoystickRight = Joystick.GetWindowRight();

      //update center position
      int HalfBrowserWidth = browser.GetWindowWidth() / 2;
      int HalfBrowserHeight = browser.GetWindowHeight() / 2;

      //prevent divide by 0
      if(HalfBrowserWidth == 0 or HalfBrowserHeight == 0)
        continue;
      
      BrowserCenterX = BrowserLeft + HalfBrowserWidth;
      BrowserCenterY = BrowserTop + HalfBrowserHeight;
      //get relative
      int CenterLeft = BrowserCenterX - HalfSize;
      int CenterTop = BrowserCenterY - HalfSize;
      int RelativeX = JoystickLeft - CenterLeft;
      int RelativeY = JoystickTop - CenterTop;

      if(JoystickLeft < BrowserLeft) Joystick.SetWindowPosition(BrowserLeft, JoystickTop);
      if(JoystickTop < BrowserTop) Joystick.SetWindowPosition(JoystickLeft, BrowserTop);
      if(JoystickRight > BrowserRight) Joystick.SetWindowPosition(BrowserRight - Joystick_Size, JoystickTop);
      if(JoystickBottom > BrowserBottom) Joystick.SetWindowPosition(JoystickLeft, BrowserBottom - Joystick_Size);

      float OffsetX = ((float)RelativeX / (float)HalfBrowserWidth);
      float OffsetY = ((float)RelativeY / (float)HalfBrowserWidth); // HalfBrowserHeight different browser dimensions
      //OffsetX = Math.Fmax(Math.Fmin(OffsetX, Joystick_Range), -Joystick_Range);
      //OffsetY = Math.Fmax(Math.Fmin(OffsetY, Joystick_Range), -Joystick_Range);
      //normalize the offset
      float length = Math.Sqrt(OffsetX * OffsetX + OffsetY * OffsetY) + 0.001; //prevent divide by zero
      if(length > 1.0)
      {
        OffsetX = OffsetX / length;
        OffsetY = OffsetY / length;
      }

      float eyeX = (OffsetX * Joystick_Range) * Math.PI / 180;
      float eyeY = (OffsetY * Joystick_Range) * Math.PI / 180;

	  PushFrame(eyeX, eyeY);
	  
      Sleep(RECORD_INTERVAL);
    }
    //clear when menu exits
    Joystick = null;
  }

    string GroupHTML()
    {
        HTMLBuffer output = HTMLBufferStatic.Construct();
		output.Print("<html><body>");
        //output.Print("You are in a group!");

        output.Print("</body></html>");
		return output.AsString();
    }

	string ControlHTML()
	{
        HTMLBuffer output = HTMLBufferStatic.Construct();
		output.Print("<html><body>");

		if(activeGroup)
		{
			output.Print("<a href='live://exit_group'>Leave Group</a>");
			output.Print("<br>");
		}

		output.Print("<table>");
		output.Print("<tr> <td width='300'></td> </tr>");
		bool rowParity = false;
		int i;
		TrainzScript.Log(FacesContainer.CountTags() + " control tags");
		for(i = 0; i < FacesContainer.CountTags(); i++)
		{
		  rowParity = !rowParity;
		  string faceName = FacesContainer.GetNamedTag(FacesContainer.GetIndexedTagName(i));
		  if (rowParity)
			output.Print("<tr bgcolor=#0E2A35>");
		  else
			output.Print("<tr bgcolor=#05171E>");
	
		  output.Print("<td>");
		  if(i != faceSelection)
			output.Print("<a href='live://face_set/" + i + "'>");
		  output.Print(faceName);
		  if(i != faceSelection)
			output.Print("</a>");
	
		  output.Print("</td>");
		  output.Print("</tr>");
		}
		output.Print("</table>");

		output.Print("<br>");
		output.Print("DCC Controls:");
		output.Print("<br>");
		output.Print("<a href='live://reset_dcc'>Reset</a>");
		output.Print("<br>");
		output.Print("<trainz-object style=dial width=100 height=100 id='dcc' texture='newdriver/dcc/dcc_controller.tga' min=0.1 max=0.9 valmin=-1.0 valmax=1.0 step=0 clickstep=1 value=0.5></trainz-object>");

		output.Print("<br>");
		output.Print("<br>");
		output.Print("Packet Interval:");
		output.Print("<br>");
		output.Print("<trainz-object style=slider horizontal theme=standard-slider width=250 height=20 id='packetInterval' min=10 max=50 value=30.0 page-size=1></trainz-object>");
		output.Print("<br>");
		output.Print("<b><trainz-text id='packetInfo' text='30'></trainz-text></b>");
		output.Print("<br>");
		output.Print("Estimated delay: <trainz-text id='delayInfo' text='0.0'></trainz-text> seconds");

        output.Print("</body></html>");
		return output.AsString();
	}

	// void CreateGroup()
	// {
    //     activeGroup = OA.CreateGroup(0);
	// 	RefreshBrowserHTML();
	// }

    public OnlineGroup CreateGroup()
    {
        return OA.CreateGroup(0);
    }

	public void InviteToGroup(string user)
    {
		personalGroup.AddUser(user);
		
        Soup soup = Constructors.NewSoup();
        soup.SetNamedTag("groupCookie", personalGroup.GetOnlineGroupCookie());

        OA.PostMessage(user, soup);
    }

	void JoinGroup(string cookie)
	{
		TrainzScript.Log("Joining group " + cookie);
        
        activeGroup = OA.OpenGroup(cookie, 0);
		Sniff(activeGroup, "OnlineGroup", "ReceiveMessage", true);

		RefreshBrowserHTML();

		JoystickThread();
	}

	public void LeaveGroup()
	{
		ClearGroupCookie();
		if(activeGroup)
		{
			activeGroup.Disconnect();
			activeGroup = null;
		}
		FacesContainer.Clear();
		RefreshBrowserHTML();
		RefreshControlBrowserHTML();
	}

    thread void ControlThread()
	{
		while(controlBrowser)
		{
			float packetSize = Str.ToFloat(controlBrowser.GetElementProperty("packetInterval", "value"));
			if(packetSize > 10.0 and packetSize < 50.0)
				EYEBUFFER_SIZE = (int)packetSize;
			controlBrowser.SetTrainzText("packetInfo", (string)EYEBUFFER_SIZE);
			controlBrowser.SetTrainzText("delayInfo", (string)((float)EYEBUFFER_SIZE * RECORD_INTERVAL));
			Sleep(0.1);
		}
	}
	thread void BrowserThread()
	{
		Message msg;
		wait()
		{
			on "Browser-URL", "live://exit_group", msg:
			if ( controlBrowser and msg.src == controlBrowser )
			{
				LeaveGroup();
			}
			msg.src = null;
			continue;

			on "Browser-URL", "live://reset_dcc", msg:
			if ( controlBrowser and msg.src == controlBrowser )
			{
				controlBrowser.SetElementProperty("dcc", "value", (string)0.0);
			}
			msg.src = null;
			continue;

			on "Browser-URL", "", msg:
            if(TrainUtil.HasPrefix(msg.minor, "live://accept/"))
            {
                string command = msg.minor;
                Str.TrimLeft(command, "live://accept/");
                if(command)
                {
                    int idx = Str.ToInt(command);
                    InviteInfo info = invitations[idx];
					RemoveInvitation(idx);
					
                    TrainzScript.Log("accepted invite " + (string)idx + " from " + info.username);

					JoinGroup(info.groupCookie);
                }
            }
			else if(TrainUtil.HasPrefix(msg.minor, "live://face_set/"))
            {
                string command = msg.minor;
                Str.TrimLeft(command, "live://face_set/");
                if(command)
                {
                    int idx = Str.ToInt(command);
					faceSelection = idx;
                }

				RefreshControlBrowserHTML();
            }
            msg.src = null;
            continue;

			Sleep(0.5);
		}
	}
};