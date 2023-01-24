include "gs.gs"
include "common.gs"
include "locomotive.gs"
include "world.gs"
include "Soup.gs"
include "multiplayergame.gs"

class DieselLocomotive isclass Locomotive
{
	
Vehicle inFront;
Vehicle inBack;
Asset SA3_coupled, SA3_uncouped;

public bool Reverser;//Встал ли реверс
public float Tyaga;
public float RPM; //Обороты в минуту
public int Idle_RPM; //Холостые обороты дизеля (0% тяги)
public int Nominal_RPM; //Номинальные обороты дизеля (100% тяги)
public int Fuel_consumption; //Расход топлива при макс.мощности
public bool Gen_wire; //Провод от генератора для запитывания цепи
public int DieselState; //Переменная состояния дизеля

public float EngineMinOilPressure; //минимально допустимое давление масла при пуске дизеля, Атм
public float EngineNomOilPressure; //номинальное давление масла дизеля на холостых оборотах, Атм
public float EngineMaxOilPressure; //максимальное давление масла дизеля (на номинальных оборотах), Атм

public float GMPMinOilPressure; //номинальное давление масла ГМП на холостом ходу, Атм
public float GMPNomOilPressure; //номинальное давление масла ГМП без нагрузки (при движении накатом, тяговое усилие ноль), Атм
public float GMPMaxOilPressure; //давление, которое вызовет поломку лопаток аппаратов ГМП, Атм

float starter_timer;

public float MinTemp,WaterTemp,OilTemp,WaterTempLeftRight,OilPress,OilTempLeftRight,OilPressLeftRight,OilPressGMP,OilTempGMP,OilPressStep,OilPressGMPStep;
float[] Reltoki = new float[80];

float sin(float x)
{
	int a= (int)(x/(2*Math.PI));
	x=x-2*a*Math.PI;
	a=1;
	if(Math.PI<x and x<=2*Math.PI)
	{
		x=x-Math.PI;
		a=-a;
	}
	if(Math.PI/2<x and x<=Math.PI)
	{
		x=Math.PI-x;
	}
	return a*(x-x*x*x/6+x*x*x*x*x/120-x*x*x*x*x*x*x/5040+x*x*x*x*x*x*x*x*x/362880);
}

public void Setup (Message msg)
{
	float Season = World.GetGameSeason();
	if (0.125 <= Season < 0.375)
		MinTemp = 20;          //Осень
	else if (0.375 <= Season < 0.625)
		MinTemp = 8;        //Зима	
	else if (0.625 <= Season)
		MinTemp = 20;          //Весна	
	else if (Season < 0.125)
		MinTemp = 30;         //Лето	
	
	WaterTemp = MinTemp + Math.Rand(-5,40);  //Вода дизеля
	OilTemp = MinTemp + Math.Rand(-8,50);	 //Масло дизеля
	OilPress = EngineMinOilPressure + Math.Rand(-1*EngineMinOilPressure, 2);
	WaterTempLeftRight = Math.Rand(-5,3);    //Перекос температуры воды по моноблокам
	OilTempLeftRight = Math.Rand(-5,3);      //Перекос температуры масла по моноблокам
	OilPressLeftRight = Math.Rand(-0.5,0.5); //Перекос давления масла по моноблокам. Возможен засор системы смазки или охлаждения дизеля.	
	OilTempGMP = MinTemp + Math.Rand(-8, 25);//Температура масла ГМП
	
	OilPressStep = (EngineMaxOilPressure - EngineNomOilPressure)/7;
	OilPressGMPStep = (GMPNomOilPressure - GMPMinOilPressure) / 7;

Interface.Print(MinTemp);	
}

void SetCoupler(int pos, bool direction)
{
	switch(pos)
	{
		case 0 :
		{
			SetFXAttachment ("front_couple", SA3_uncouped);
			SetFXAttachment ("back_couple", SA3_uncouped);
			break;
		}
		case 1 :
		{
			if (direction)
			{
				SetFXAttachment ("front_couple", SA3_uncouped);
				SetFXAttachment ("back_couple", SA3_coupled);
			}
			else
			{
				SetFXAttachment ("front_couple", SA3_coupled);
				SetFXAttachment ("back_couple", SA3_uncouped);
			}
			break;
		}
		case 2 :	//// вагон в центре состава
		{
			SetFXAttachment ("front_couple", SA3_coupled);
			SetFXAttachment ("back_couple", SA3_coupled);
			break;
		}
		default :
		{
			if (direction)
			{
				SetFXAttachment ("front_couple", SA3_coupled);
				SetFXAttachment ("back_couple", SA3_uncouped);
			}
			else
			{
				SetFXAttachment ("front_couple", SA3_uncouped);
				SetFXAttachment ("back_couple", SA3_coupled);
			}			
		}
	}
}

int GetMyNumber(Vehicle[] TrainVehiclesArray)
{
	int i=0,ArraySize = TrainVehiclesArray.size();

	Vehicle MyVeh=(cast<Vehicle>me);

	while(i<ArraySize)
		{
		if(TrainVehiclesArray[i]==MyVeh)
			return i;
		i++;
		}
	
	return 0;
}

void MyPosition(void)
{
	Train MyTrain=me.GetMyTrain();
	if(MyTrain!=null)
	{
		Vehicle[] TrainVehiclesArray = MyTrain.GetVehicles();

		int a=me.GetMyNumber(TrainVehiclesArray);
 		int size_of_train=TrainVehiclesArray.size();
		bool direction = (cast<Vehicle>me).GetDirectionRelativeToTrain();

		if(size_of_train==1)	//вагон одиночный
		{
			inFront=null;
			inBack=null;
			SetCoupler(0,direction);
		}
		
		else if(a==0)	//// вагонов больше одного, этот вагон находиться первым в составе
		{
			inFront=null;
			inBack=TrainVehiclesArray[1];
			SetCoupler(1,direction);
		}
		else if(a<(size_of_train-1)) //// вагонов больше одного, этот вагон находиться в центре состава
		{
			inFront=TrainVehiclesArray[a-1];
			inBack=TrainVehiclesArray[a+1];
			SetCoupler(2,direction);
		}
		else 				//// вагонов больше одного, этот вагон находиться в конце состава
		{
			inFront=TrainVehiclesArray[size_of_train-2];
			inBack=null;
			SetCoupler(3,direction);
		}
	}
}

void CoupleHandler(Message msg)
{
	if(msg.src==me)
	{
		me.MyPosition();
		//World.PlaySound(MyAsset1, "sound/coupling.wav", 1.0f, 20.0f, 100.0f, me, "a.bog0");
	}
}

void DecoupleHandler(Message msg)
{
	if(msg.src==me or msg.src==inFront or msg.src==inBack)
	{
		me.MyPosition();
		//World.PlaySound(MyAsset1, "sound/decoupling.wav", 1.0f, 20.0f, 100.0f, me, "a.bog0");
	}
}

public void Contactor (bool usl,bool pam,float Voltage,float volume,int numrel,float Resistance)
{
	bool rels;
	if(numrel>0)
	{
		if(usl)
		{
			Reltoki[numrel]=Voltage/Resistance;
		}
		else
		{
			Reltoki[numrel]=0;
		}
	}
	
if(pam and !usl)
{
	pam = false; rels = false;
}
if(!pam and usl)
{
	pam = true; rels = true;
}
rels = pam;
//return rels;
}

public void Diesel(int state)
{
	if (state == 1.f) //Состояние запуска
	{
		SetBrokenThrottle(true);
		starter_timer = starter_timer + 0.1;
		Sleep(0.005); 
		PlaySoundScriptEvent("start");
		PostMessage(me,"pfx","+1",0.1);
		if (starter_timer >= 0 and starter_timer <= 5.5)
		{
			RPM = (sin((starter_timer/1.5)+4.8)+1)*450;
		}
		if (starter_timer > 5.5)
		{
			PostMessage(me,"pfx","-1",0.6);
			RPM = RPM - 5;
			Sleep(0.005);
			if (RPM <= Idle_RPM)
			{
				DieselState = 2.f;
				starter_timer = 0;
			}
		}
	}

    else if(state == 2.f) //В работе
	{
		SetBrokenThrottle(false);
		PlaySoundScriptEvent("engine");
		PostMessage(me,"pfx","+0",0.1);
		Gen_wire = true;
		SetEngineSetting("throttle",Tyaga);
	}
	else if (state == 3.f) //Остановка дизеля
	{
		StopSoundScriptEvent("engine");
		PlaySoundScriptEvent("stop");
		PostMessage(me,"pfx","-0",0.6);
		DieselState = 0.f;
		RPM = 0;
		Gen_wire = false;
		SetBrokenThrottle(true);
	}
}

void DieselSync(Message msg)
{
	if(msg.src==me)
	{

	}
}

//*************************************************************************//
// Generator - для запитывания схемы от генератора дизеля независимо от АБ //
//*************************************************************************//
public void Generator(bool in, bool out)
{
	if (in and !out)
		out = true;
	
	else if (!in and out)
		out = false;
}

void SendMessageToServer(Soup data)
{
	MultiplayerGame.SendGameplayMessageToServer("DieselLocomotive", "mult_server", data);
}

void SendMessagesToClient(Soup data)
{
	MultiplayerGame.BroadcastGameplayMessage("DieselLocomotive", "mult_client", data);
}

public void MultiplayerSync(void)
{
	if( !MultiplayerGame.IsServer() )
		{

		Soup Temp_soup = Constructors.NewSoup();

		Temp_soup.SetNamedTag("DieselState",DieselState);

		SendMessageToServer(Temp_soup);

		Temp_soup.Clear();
		Temp_soup = null;

		return;
		}
}

public void Init(void)
{
	inherited();
	SetBrokenThrottle(true);
	AddHandler(me, "World", "ModuleInit", "Setup");
	SA3_coupled	= me.GetAsset().FindAsset("SA3-coupled");
	SA3_uncouped = me.GetAsset().FindAsset("SA3-uncoupled");
	me.AddHandler(me,"Vehicle","Coupled","CoupleHandler");
	me.AddHandler(me,"Vehicle","Decoupled","DecoupleHandler");
	me.PostMessage(me,"Vehicle","Coupled",0.8); 
	AddHandler(me, "DieselLocomotive", "mult_client", "DieselSync");
}
};